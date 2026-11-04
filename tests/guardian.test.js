const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../guardian.js");

test("bonus attempts do not imply reward collection", () => {
  assert.match(G.readBonus("Denní bonus\n0x\nKaždý den máte 5 zatočení zdarma"), /Zobrazené pokusy: 0/);
  assert.match(G.readBonus("Každý den máte 5 zatočení zdarma"), /Neznáme/);
  assert.throws(() => G.readBonus("Login"), /Nerozpoznaná/);
});
test("casino detects existing bets without inferring an absent bet", () => {
  assert.equal(G.readCasino("Super 6 Již máme vsazeno. Počet slosování: 12"), "Vsadené · počet slosovaní: 12");
  assert.match(G.readCasino("Super 6"), /Neznáme/);
  assert.throws(() => G.readCasino("Login"), /Nerozpoznaná/);
});
test("NN uses newest dated report and does not invent an interval", () => {
  assert.match(G.readNN("» 4. 11. 2026:\n08:34:19 mayk NN - další 09:14 - 09:34\nNN - další 08:31 - 08:51"),
    /4\. 11\. 2026: ďalšia NN 09:14–09:34/);
  assert.match(G.readNN("NN - další 09:14 - 09:34"), /Neznáme/);
  assert.match(G.readNN("» 3. 11. 2026:\nNN - další 23:54 - 00:14"), /nasledujúci deň/);
});

test("Guardian only requests sequential pages after explicit refresh", async t => {
  class Element {
    constructor() { this.children = []; this.listeners = {}; }
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
  let saved;
  let fail = false;
  G.mount(container, {
    storage: { get: async () => null, set: async (key, state) => { saved = structuredClone(state); } },
    log() {}, canEdit: () => true,
    getDocument: async url => {
      requests.push(url);
      maxActive = Math.max(maxActive, ++active);
      await Promise.resolve();
      active--;
      if (fail) throw new Error("Offline");
      const text = url.includes("denniBonus") ? "Každý den máte 5 zatočení zdarma 0x" :
        url.includes("s=6") ? "Super 6 Již máme vsazeno. Počet slosování: 12 Poslední tažená čísla: 04.11.2026 v 08:00 5, 8, 10, 22, 6, 7" :
          "» 4. 11. 2026:\nNN - další 09:14 - 09:34";
      return { body: { cloneNode: () => ({ textContent: text, querySelectorAll: () => [] }) } };
    }
  });
  await Promise.resolve();
  assert.equal(requests.length, 0, "mount and restore make no game requests");
  await container.querySelector("#sgo-guardian-refresh").listeners.click();
  assert.equal(requests.length, 3);
  assert.equal(maxActive, 1);
  assert.match(saved.casino.text, /12/);
  assert.ok(saved.bonus.time);
  assert.match(saved.nn.text, /09:14/);
  await Promise.resolve();
  assert.equal(requests.length, 3, "no automatic retries or refreshes");
  fail = true;
  await container.querySelector("#sgo-guardian-refresh").listeners.click();
  assert.equal(requests.length, 4, "first failure stops the sequence");
  assert.match(saved.bonus.text, /Neznáme.*Offline/);
});
