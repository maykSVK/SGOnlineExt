const { test } = require("node:test");
const assert = require("node:assert/strict");
const K = require("../parks.js");

function buildings(states = {
  "1": { name: "Alpha", sdi: 100, bs: 800, parks: 50, factories: 600, freeSlots: 50 },
  "2": { name: "Beta", sdi: 200, bs: 400, parks: 100, factories: 2000, freeSlots: 2000 }
}, balance = "1 000 000") {
  const prices = { sdi: "100.0", bs: "10.5", parku: "20.25" };
  const fields = Object.fromEntries(["planeta", "mest", "vyroben", "sdi", "bs", "parku", "laboratori", "kasaren", "verze", "postavit"].map(name => [name, {
    name, type: name === "postavit" ? "submit" : "text", value: "", dispatchEvent() {},
    closest: () => ({ textContent: name === "mest" ? "+9 000 000 lidí" : "-36 000 lidí", querySelector: () => ({ textContent: prices[name] }) })
  }]));
  fields.planeta.value = "2";
  fields.planeta.options = Object.entries(states).map(([id, state]) => ({ value: id, textContent: state.name }));
  fields.verze.options = [{ value: "0" }]; fields.postavit.value = "Postavit";
  const form = {
    method: "post", getAttribute: () => "game.php?page=planety",
    elements: Object.assign(Object.values(fields), { namedItem: name => fields[name] }),
    querySelector: selector => fields[selector.match(/name="([^"]+)"/)?.[1]] || null, scrollIntoView() {}
  };
  const cell = textContent => ({ textContent: String(textContent) });
  return {
    forms: [form], fields, defaultView: { Event },
    querySelector: selector => selector.includes("balance") ? { textContent: balance } : fields[selector.match(/name="([^"]+)"/)?.[1]],
    getElementById(id) {
      const state = states[id.slice(3)];
      return state && { cells: [{ querySelector: () => ({ getAttribute: () => "?typ=21" }) }, cell(state.name),
        cell(100), cell(state.factories), cell(state.sdi), cell(state.bs), cell(state.parks), cell(0), cell(0),
        cell(`100 / ${100 + state.freeSlots}`)] };
    }
  };
}
class Element {
  constructor(doc) { this.ownerDocument = doc; this.children = []; this.listeners = {}; this.value = ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
}
function container(doc = buildings()) {
  doc.createElement = () => new Element(doc);
  const elements = new Map();
  return { ownerDocument: doc, innerHTML: "", setAttribute(name, value) { this[name] = value; },
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element(doc)); return elements.get(selector); } };
}
function setup(t, overrides = {}) {
  const previous = globalThis.location;
  globalThis.location = { href: "https://game.test/game.php?page=prehled" };
  t.after(() => { if (previous === undefined) delete globalThis.location; else globalThis.location = previous; });
  const states = {
    "1": { name: "Alpha", sdi: 100, bs: 800, parks: 50, factories: 600, freeSlots: 50 },
    "2": { name: "Beta", sdi: 200, bs: 400, parks: 100, factories: 2000, freeSlots: 2000 }
  };
  const saved = new Map(), drafts = new Map(), calls = [], pauses = [];
  const storage = { get: async key => structuredClone(saved.get(key)), set: async (key, value) => saved.set(key, structuredClone(value)) };
  const session = { getItem: key => drafts.get(key) || null, setItem: (key, value) => drafts.set(key, value), removeItem: key => drafts.delete(key) };
  const ui = container();
  const options = {
    storage, session, getDocument: async () => buildings(states),
    postDocument: async (url, body) => {
      calls.push(new URLSearchParams(body));
      const state = states[body.get("planeta")];
      for (const [key, field] of [["sdi", "sdi"], ["bs", "bs"], ["parks", "parku"]]) {
        const change = Number(body.get(field) || 0); state[key] += change; state.freeSlots -= change;
      }
      const factories = Number(body.get("vyroben") || 0); state.factories += factories; state.freeSlots -= factories;
      return {};
    }, withLock: async action => action(), delayFn: () => 3000, sleep: async ms => pauses.push(ms),
    ...overrides
  };
  const module = K.mount(ui, options);
  return { states, saved, drafts, calls, pauses, storage, session, ui, options, module };
}

function selectFirst(ui) {
  const checkbox = ui.querySelector("#sgo-parks-list").children[0].children[0];
  checkbox.checked = true; checkbox.listeners.change();
}

test("OR filter includes any missing enabled target and never removes excess buildings", () => {
  const config = K.settings(K.DEFAULTS);
  assert.deepEqual(config, { sdi: { enabled: true, target: 200 }, bs: { enabled: true, target: 1000 }, parks: { enabled: false, target: 500 } });
  const [a, b] = K.readPlanets(buildings());
  assert.deepEqual(K.calculate(a, config).missing, { sdi: 100, bs: 200, parks: 0 });
  assert.equal(K.calculate(b, config).matches, true, "BS is below target even when SDI is at target");
  assert.deepEqual(K.calculate({ ...b, sdi: 300 }, config).missing, { sdi: 0, bs: 600, parks: 0 });
  assert.equal(K.calculate({ ...b, bs: 1000 }, config).matches, false, "all targets met");
  config.sdi.enabled = false;
  assert.equal(K.calculate(b, config).matches, true);
  config.bs.enabled = false;
  assert.equal(K.calculate(b, config).matches, false, "no enabled targets means no matches");
  config.parks.enabled = true;
  assert.deepEqual(K.calculate(b, config).missing, { sdi: 0, bs: 0, parks: 400 });
  config.sdi.enabled = true;
  assert.equal(K.calculate(b, config).matches, true);
  assert.throws(() => K.settings({ ...config, sdi: { enabled: true, target: -1 } }), /nezáporné/);
});

test("multi-building budget uses precise prices and compares exact total", () => {
  const budget = K.readBudget(buildings());
  assert.deepEqual(budget.prices, { sdi: 10000, bs: 1050, parks: 2025 });
  assert.deepEqual(K.budgetFor({ prices: budget.prices, balance: 102025 }, { sdi: 10, bs: 0, parks: 1 }), { cost: 102025, remaining: 0 });
  assert.equal(K.budgetFor({ prices: budget.prices, balance: 102024 }, { sdi: 10, bs: 0, parks: 1 }).remaining, -1);
});

test("prefill calculates all enabled quantities and demolishes only necessary factories", () => {
  const doc = buildings();
  const report = K.calculate(K.readPlanets(doc)[0], K.settings(K.DEFAULTS));
  const plan = K.fill(doc, report);
  assert.equal(doc.fields.planeta.value, "1");
  assert.equal(doc.fields.sdi.value, "100"); assert.equal(doc.fields.bs.value, "200");
  assert.equal(doc.fields.parku.value, ""); assert.equal(doc.fields.vyroben.value, "-250");
  assert.deepEqual(plan, { demolish: 250, factories: 350, sdi: 200, bs: 1000, parks: 50 });
  const partial = buildings({ "2": { name: "Beta", sdi: 250, bs: 500, parks: 100, factories: 2000, freeSlots: 200 } });
  const partialPlan = K.fill(partial, K.calculate(K.readPlanets(partial)[0], K.settings(K.DEFAULTS)));
  assert.equal(partial.fields.sdi.value, ""); assert.equal(partial.fields.bs.value, "500");
  assert.equal(partial.fields.vyroben.value, "-300");
  assert.deepEqual(partialPlan, { demolish: 300, factories: 1700, sdi: 250, bs: 1000, parks: 100 });
  const dirty = buildings(); dirty.fields.parku.value = "3";
  assert.throws(() => K.fill(dirty, report), /rozpracované/);
  assert.throws(() => K.fill(buildings({ "1": { name: "Alpha", sdi: 101, bs: 800, parks: 50, factories: 600, freeSlots: 50 } }), report), /zmenili/);
  assert.throws(() => K.construction({ ...report, factories: 249 }), /dosť výroben/);
});

test("settings persist, filter updates without scan and all disabled yields empty list", async t => {
  const f = setup(t);
  await f.module.load();
  assert.equal(f.ui.querySelector("#sgo-parks-list").children.length, 2);
  f.ui.querySelector("#sgo-build-sdi-enabled").checked = false;
  await f.ui.querySelector("#sgo-parks-save").listeners.click();
  assert.equal(f.saved.get("sgo-dostavby-settings").bs.target, 1000);
  assert.equal(f.ui.querySelector("#sgo-parks-list").children.length, 2);
  f.ui.querySelector("#sgo-build-bs-enabled").checked = false;
  await f.ui.querySelector("#sgo-parks-save").listeners.click();
  assert.equal(f.ui.querySelector("#sgo-parks-list").children.length, 0);
  const next = K.mount(container(), f.options); await next.draftsReady;
  assert.equal(f.calls.length, 0, "filter and restore never submit");
});

test("prefill navigation uses building page, rechecks fresh state and reappears if not confirmed", async t => {
  let destination;
  const f = setup(t, { navigate: async url => { destination = url; } });
  await f.module.load();
  await f.ui.querySelector("#sgo-parks-list").children[0].children[2].listeners.click();
  assert.equal(destination, "https://game.test/game.php?page=planety");
  globalThis.location.href = destination;
  const native = buildings(f.states), next = container(native);
  await K.mount(next, f.options).draftsReady;
  assert.equal(native.fields.sdi.value, "100");
  assert.equal(native.fields.bs.value, "200");
  assert.equal(native.fields.vyroben.value, "-250");
  assert.equal(next.querySelector("#sgo-parks-list").children.length, 1);
  const unconfirmed = container(buildings(f.states));
  await K.mount(unconfirmed, f.options).draftsReady;
  assert.equal(unconfirmed.querySelector("#sgo-parks-list").children.length, 2);
  assert.equal(f.calls.length, 0);
});

test("bulk builds selected planets with fresh OR recheck, correct form and verified journal", async t => {
  const f = setup(t);
  await f.module.load();
  selectFirst(f.ui);
  assert.match(f.ui.querySelector("#sgo-parks-totals").textContent, /\+100 SDI · \+200 BS · −250 výroben/);
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent.replace(/\s/g, ""), /12100/);
  await f.module.buildSelected();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].get("sdi"), "100"); assert.equal(f.calls[0].get("bs"), "200");
  assert.equal(f.calls[0].get("parku"), ""); assert.equal(f.calls[0].get("vyroben"), "-250");
  assert.equal(f.saved.get("sgo-dostavby-pending"), null);
  assert.equal(f.ui.querySelector("#sgo-parks-list").children.length, 1);
  await f.module.buildSelected();
  assert.equal(f.calls.length, 1);
});

test("select all prices partial deficits and bulk rechecks them without reducing fulfilled targets", async t => {
  const f = setup(t);
  f.states["2"].sdi = 250; f.states["2"].bs = 500;
  await f.module.load();
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  assert.match(f.ui.querySelector("#sgo-parks-totals").textContent, /\+100 SDI · \+700 BS · −250 výroben/);
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent.replace(/\s/g, ""), /17350/);
  f.states["1"].bs = 1000;
  await f.module.buildSelected();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].get("sdi"), "100"); assert.equal(f.calls[0].get("bs"), "");
  assert.equal(f.calls[0].get("vyroben"), "-50");
  assert.equal(f.calls[1].get("sdi"), ""); assert.equal(f.calls[1].get("bs"), "500");
  assert.equal(f.calls[1].get("vyroben"), "");
  assert.deepEqual([f.states["2"].sdi, f.states["2"].bs], [250, 1000]);
  assert.equal(f.ui.querySelector("#sgo-parks-list").children.length, 0);
});

test("lost response never repeats a potentially applied build; verified state reconciles", async t => {
  const f = setup(t);
  const post = f.options.postDocument;
  const first = K.mount(f.ui, { ...f.options, postDocument: async (url, body) => { await post(url, body); throw new Error("Offline"); } });
  await first.load(); selectFirst(f.ui); await first.buildSelected();
  assert.equal(f.calls.length, 1);
  assert.equal(f.saved.get("sgo-dostavby-pending").sdi, 200);
  const next = K.mount(f.ui, f.options); await next.draftsReady;
  selectFirst(f.ui); await next.buildSelected();
  assert.equal(f.calls.length, 1, "verified prior build is not resent");
  assert.equal(f.saved.get("sgo-dostavby-pending"), null);
});

test("different actual values after uncertain POST block further submissions", async t => {
  const f = setup(t, { postDocument: async () => { throw new Error("Offline"); } });
  await f.module.load(); selectFirst(f.ui); await f.module.buildSelected();
  await f.module.buildSelected();
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /Neistý výsledok/);
});

test("three enabled targets are added together and budget includes each building", async t => {
  const f = setup(t);
  await f.module.load();
  f.ui.querySelector("#sgo-build-parks-enabled").checked = true;
  await f.ui.querySelector("#sgo-parks-save").listeners.click();
  selectFirst(f.ui);
  assert.equal(f.ui.querySelector("#sgo-parks-totals").textContent, "Označ planéty, ktoré chceš upraviť.");
  const card = f.ui.querySelector("#sgo-parks-list").children[0];
  assert.equal(card.children[2].disabled, true, "not enough factories prevents building");
  assert.equal(f.ui.querySelector("#sgo-parks-build").disabled, true);
  f.states["1"].factories = 800;
  await f.module.load();
  selectFirst(f.ui);
  assert.match(f.ui.querySelector("#sgo-parks-totals").textContent, /\+100 SDI · \+200 BS · \+450 Parky · −700 výroben/);
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent.replace(/\s/g, ""), /21212,5/);
  await f.module.buildSelected();
  assert.equal(f.calls[0].get("parku"), "450");
  assert.equal(f.calls[0].get("vyroben"), "-700");
  assert.deepEqual([f.states["1"].sdi, f.states["1"].bs, f.states["1"].parks], [200, 1000, 500]);
});

test("bulk skips planets with all targets met and rejects an unexpected POST action", async t => {
  const f = setup(t);
  await f.module.load(); selectFirst(f.ui);
  f.states["1"].bs = 1000; f.states["1"].sdi = 200;
  await f.module.buildSelected();
  assert.equal(f.calls.length, 0);
  assert.equal(f.ui.querySelector("#sgo-parks-list").children.length, 1);
  f.states["1"].bs = 800; f.states["1"].sdi = 100;
  const bad = K.mount(f.ui, { ...f.options, getDocument: async () => {
    const doc = buildings(f.states); doc.forms[0].getAttribute = () => "https://other.test/game.php?page=planety"; return doc;
  } });
  await bad.load(); f.ui.querySelector("#sgo-parks-all").listeners.click(); await bad.buildSelected();
  assert.equal(f.calls.length, 0);
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /Neočakávaný cieľ/);
});

test("stop during cooldown leaves remaining selected planets untouched", async t => {
  const f = setup(t);
  f.states["2"].sdi = 50;
  f.options.sleep = async () => f.ui.querySelector("#sgo-parks-stop").listeners.click();
  const module = K.mount(f.ui, f.options);
  await module.load(); f.ui.querySelector("#sgo-parks-all").listeners.click(); await module.buildSelected();
  assert.equal(f.calls.length, 1);
  assert.equal(f.states["2"].sdi, 50);
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /Zastavené/);
});

test("invalid settings never alter persisted configuration", async t => {
  const f = setup(t);
  await f.module.draftsReady;
  f.ui.querySelector("#sgo-build-bs-target").value = "-1";
  await f.ui.querySelector("#sgo-parks-save").listeners.click();
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /nezáporné/);
  assert.equal(f.saved.has("sgo-dostavby-settings"), false);
});

test("saved planets restore across navigation without a new request and update on building page", async t => {
  const f = setup(t);
  await f.module.load();
  const saved = container();
  await K.mount(saved, { ...f.options, getDocument: async () => assert.fail("restore must not fetch") }).draftsReady;
  assert.equal(saved.querySelector("#sgo-parks-list").children.length, 2);
  assert.match(saved.querySelector("#sgo-parks-status").textContent, /neaktuálne/);
  f.states["1"].sdi = 200; f.states["1"].bs = 1000;
  globalThis.location.href = "https://game.test/game.php?page=planety";
  const refreshed = container(buildings(f.states));
  await K.mount(refreshed, f.options).draftsReady;
  assert.equal(refreshed.querySelector("#sgo-parks-list").children.length, 1);
});

test("expired draft is consumed without touching the native form", async t => {
  const f = setup(t);
  await f.module.draftsReady;
  globalThis.location.href = "https://game.test/game.php?page=planety";
  f.drafts.set("sgo-dostavby-draft", JSON.stringify({ id: "1", name: "Alpha", config: K.DEFAULTS, time: Date.now() - 600001 }));
  const native = buildings(f.states), ui = container(native);
  await K.mount(ui, f.options).draftsReady;
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /vypršalo/);
  assert.equal(native.fields.sdi.value, ""); assert.equal(native.fields.bs.value, "");
  assert.equal(f.drafts.size, 0);
});

test("hung refresh shows timeout, aborts read and allows retry", async t => {
  const f = setup(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  const module = K.mount(f.ui, { ...f.options, getDocument: (url, options) => { signal = options.signal; return new Promise(() => {}); } });
  await module.draftsReady;
  const loading = module.load();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /Načítavam/);
  t.mock.timers.tick(30000);
  await loading;
  assert.equal(signal.aborted, true);
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /30 sekúnd/);
  assert.equal(f.ui.querySelector("#sgo-parks-load").disabled, false);
});

test("invalid price is explicit and never reports affordable", async t => {
  const f = setup(t);
  const module = K.mount(f.ui, { ...f.options, getDocument: async () => {
    const doc = buildings(f.states);
    doc.fields.bs.closest = () => ({ textContent: "-36 000 lidí", querySelector: () => ({ textContent: "?" }) });
    return doc;
  } });
  await module.load(); f.ui.querySelector("#sgo-parks-all").listeners.click();
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent, /nie sú dostupné/);
  assert.doesNotMatch(f.ui.querySelector("#sgo-parks-budget").textContent, /Stačí/);
});
