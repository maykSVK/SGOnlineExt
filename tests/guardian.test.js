const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../guardian.js");

test("bonus with no remaining attempts is complete; unreadable attempts stay unknown", () => {
  const completed = G.readBonus("Denní bonus\n0x\nKaždý den máte 5 zatočení zdarma");
  assert.deepEqual(completed, { status: "ok", text: "Dnešné pokusy využité" });
  const now = Date.parse("2026-11-04T09:30:00Z");
  assert.equal(G.displayState("bonus", { ...completed, time: now }, now).status, "ok");
  assert.equal(G.displayState("bonus", { ...completed, time: now }, now + 86400000).status, "unknown");
  assert.equal(G.readBonus("Denní bonus\n0\nx\nKaždý den máte 5 zatočení zdarma").status, "ok");
  assert.equal(G.readBonus("Denní bonus\n5 x\nKaždý den máte 5 zatočení zdarma").status, "action");
  assert.equal(G.readBonus("Každý den máte 5 zatočení zdarma").status, "unknown");
  assert.throws(() => G.readBonus("Login"), /Nerozpoznaná/);
});
test("casino detects existing bets without inferring an absent bet", () => {
  assert.deepEqual(G.readCasino("Super 6 Již máme vsazeno. Počet slosování: 12"), { status: "ok", text: "Vsadené · 12 slosovaní" });
  assert.equal(G.readCasino("Super 6").status, "unknown");
  assert.equal(G.readCasino("Super 6 Je možné vsadit na další slosování.").status, "unknown");
  assert.equal(G.readCasino("Super 6 Ještě nemáte vsazeno.").status, "action");
  assert.equal(G.readCasino("Super 6", { querySelectorAll: () => [{ value: "Vsadit", textContent: "" }] }).status, "action");
  assert.equal(G.readCasino("Super 6 Již máme vsazeno.", { querySelectorAll: () => [{ value: "Vsadit", textContent: "" }] }).status, "ok");
  assert.throws(() => G.readCasino("Login"), /Nerozpoznaná/);
});
test("NN uses newest dated report and does not invent an interval", () => {
  assert.equal(G.readNN("» 4. 11. 2026:\n08:34:19 mayk NN - další 09:14 - 09:34\nNN - další 08:31 - 08:51").start, "09:14");
  assert.equal(G.readNN("NN - další 09:14 - 09:34").status, "unknown");
  assert.equal(G.readNN("» 3. 11. 2026:\n23:45:00 mayk NN - další 00:25 - 00:45").date, "2026-11-04");
});

test("status colors reflect pending actions, freshness and NN windows in game timezone", () => {
  const now = Date.parse("2026-11-04T08:20:00Z");
  assert.equal(G.displayState("bonus", undefined, now).status, "unknown");
  assert.equal(G.displayState("bonus", { status: "ok", time: now - 86400000 }, now).status, "unknown");
  assert.equal(G.displayState("casino", { status: "ok", time: now - 6 * 3600000 }, now).status, "unknown");
  const nn = { ...G.readNN("» 4. 11. 2026: 08:34:19 NN - další 09:14 - 09:34"), time: now };
  assert.equal(G.displayState("nn", nn, Date.parse("2026-11-04T08:00:00Z")).status, "ok");
  assert.equal(G.displayState("nn", nn, now).status, "action");
  assert.equal(G.displayState("nn", nn, Date.parse("2026-11-04T09:00:00Z")).status, "unknown");
  const overnight = { ...G.readNN("» 3. 11. 2026: 23:14:54 NN - další 23:54 - 00:14"), time: now };
  assert.equal(G.displayState("nn", overnight, Date.parse("2026-11-03T23:05:00Z")).status, "action");
});

test("detached DOM text preserves adjacent inline boundaries and skips scripts", () => {
  const nodes = ["Poslední tažená čísla:", "04.11.2026", " v ", "08:00", "5, 8, 10, 22, 6, 7"];
  let removed = 0;
  const doc = {
    body: { cloneNode: () => ({ querySelectorAll: () => [{ remove: () => removed++ }] }) },
    createTreeWalker: () => {
      let i = -1;
      return { nextNode() { i++; this.currentNode = { textContent: nodes[i] }; return i < nodes.length; } };
    }
  };
  const text = G.pageText(doc);
  assert.equal(removed, 1);
  assert.match(text, /08:00\n5,/);
  assert.equal(require("../lottery.js").readDraws(text).length, 1);
});

test("one explicit refresh checks all pages; history errors never replace casino status or skip NN", async t => {
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.dataset = {}; this.value = ""; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  const oldDoc = globalThis.document;
  const oldLocation = globalThis.location;
  t.after(() => {
    if (oldDoc === undefined) delete globalThis.document;
    else globalThis.document = oldDoc;
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
  });
  globalThis.document = { createElement: () => new Element() };
  globalThis.location = { href: "https://stargame-online.cz/game.php" };
  const elements = new Map();
  const container = { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  } };
  const requests = [];
  let active = 0;
  let maxActive = 0;
  const saved = {};
  let fail = false;
  let badHistory = false;
  let synced = 0;
  const store = {
    "sgo-gist-config": { id: "a".repeat(32), token: "test-token" },
    "sgo-lottery-history": [{ at: "2026-11-04T02:00", numbers: [1, 2, 3, 4, 5, 6] }]
  };
  const guardian = G.mount(container, {
    storage: { get: async key => store[key], set: async (key, state) => { saved[key] = structuredClone(state); } },
    syncHistory: async (config, history) => { synced++; return history; },
    log() {}, canEdit: () => true,
    getDocument: async url => {
      requests.push(url);
      maxActive = Math.max(maxActive, ++active);
      await Promise.resolve();
      active--;
      if (fail) throw new Error("Offline");
      const text = url.includes("denniBonus") ? "Každý den máte 5 zatočení zdarma 0x" :
        url.includes("s=6") ? `Super 6 Již máme vsazeno. Počet slosování: 12 ${badHistory ? "" : "Poslední tažená čísla: 04.11.2026 v 08:00 5, 8, 10, 22, 6, 7"}` :
          "» 4. 11. 2026:\nNN - další 09:14 - 09:34";
      return {
        querySelectorAll: () => [],
        body: { cloneNode: () => ({ querySelectorAll: () => [] }) },
        createTreeWalker: () => {
          let read = false;
          return { currentNode: { textContent: text }, nextNode() { if (read) return false; read = true; return true; } };
        }
      };
    }
  });
  await Promise.resolve();
  assert.equal(requests.length, 0, "mount and restore make no game requests");
  await container.querySelector("#sgo-guardian-refresh").listeners.click();
  assert.equal(requests.length, 3);
  assert.equal(maxActive, 1);
  assert.match(saved["sgo-guardian"].casino.text, /12/);
  assert.ok(saved["sgo-guardian"].bonus.time);
  assert.equal(saved["sgo-guardian"].bonus.status, "ok");
  assert.match(saved["sgo-guardian"].nn.text, /09:14/);
  assert.equal(synced, 1);
  guardian.render();
  await Promise.resolve();
  assert.equal(requests.length, 3, "render makes no requests, and there are no automatic retries or refreshes");
  badHistory = true;
  await container.querySelector("#sgo-guardian-refresh").listeners.click();
  assert.equal(requests.length, 6);
  assert.equal(saved["sgo-guardian"].casino.status, "ok");
  assert.match(saved["sgo-guardian"].nn.text, /09:14/);
  assert.equal(synced, 2, "cached history still synchronizes after draw parsing fails");
  assert.equal(saved["sgo-lottery-history"].length, 2, "stored history is preserved");
  assert.match(container.querySelector("#sgo-guardian-status").textContent, /Časť kontroly zlyhala/);
  fail = true;
  await container.querySelector("#sgo-guardian-refresh").listeners.click();
  assert.equal(requests.length, 7, "network failure stops the sequence");
  assert.equal(saved["sgo-guardian"].bonus.status, "unknown");
  assert.match(saved["sgo-guardian"].bonus.error, /Offline/);
});
