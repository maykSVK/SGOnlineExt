const { test } = require("node:test");
const assert = require("node:assert/strict");
const K = require("../parks.js");

function buildings({ free = 500, parks = 20, factories = 100, effect = "+0.1 spokojenost", price = "30 624.0", balance = "1 101 348 705" } = {}) {
  const fields = Object.fromEntries(["planeta", "mest", "vyroben", "sdi", "bs", "parku", "laboratori", "kasaren", "verze", "postavit"]
    .map(name => [name, { value: "", dispatchEvent() {}, closest: () => ({ textContent:
      name === "parku" ? effect : name === "mest" ? "+9 000 000 lidí" : "-36 000 lidí",
      querySelector: () => ({ textContent: price }) }) }]));
  fields.planeta.value = "1";
  fields.planeta.options = [{ value: "1", textContent: "Alpha" }, { value: "2", textContent: "Beta" }];
  fields.verze.options = [{ value: "0" }, { value: "1" }];
  fields.verze.value = "1";
  const form = {
    method: "post", getAttribute: () => "game.php?page=planety",
    elements: Object.assign(Object.entries(fields).map(([name, field]) => Object.assign(field, { name, type: name === "postavit" ? "submit" : "text" })), { namedItem: name => fields[name] }),
    querySelector: selector => fields[selector.match(/name="([^"]+)"/)?.[1]] || null,
    scrollIntoView() {}
  };
  const cell = textContent => ({ textContent });
  return {
    fields, forms: [form], defaultView: { Event },
    querySelector: selector => selector.includes("balance") ? { textContent: balance } : fields.parku,
    getElementById: () => ({ cells: [
      { querySelector: () => ({ getAttribute: () => "?typ=21" }) }, cell(""),
      cell("100"), cell(String(factories)), cell("0"), cell("0"), cell(String(parks)), cell("0"), cell("0"),
      cell(`${100 + parks} / ${100 + parks + free}`)
    ] })
  };
}

function detail(id = "2", happiness = "167.00", parks = 20, name = "Beta") {
  const end = { nodeName: "BR" };
  const text = { nodeName: "#text", textContent: ` ${happiness} %`, nextSibling: end };
  return {
    querySelector: selector => selector.startsWith("select")
      ? { value: id, options: [{ value: id, textContent: name }] }
      : { nextSibling: text },
    querySelectorAll: () => [{
      textContent: "Parky", parentElement: { nextElementSibling: { textContent: String(parks) } }
    }]
  };
}

class Element {
  constructor(doc) { this.ownerDocument = doc; this.children = []; this.listeners = {}; this.value = ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
}

function container(doc = buildings()) {
  doc.createElement = () => new Element(doc);
  const elements = new Map();
  return {
    ownerDocument: doc, innerHTML: "", setAttribute(name, value) { this[name] = value; },
    querySelector: selector => {
      if (!elements.has(selector)) elements.set(selector, new Element(doc));
      return elements.get(selector);
    }
  };
}

function locationFor(t, href = "https://game.test/game.php?page=prehled") {
  const previous = globalThis.location;
  globalThis.location = { href };
  t.after(() => { if (previous === undefined) delete globalThis.location; else globalThis.location = previous; });
}

test("park minimum meets the target with no redundant park, including decimal rounding", () => {
  assert.deepEqual(K.calculate(167, 20, 180), { happiness: 167, parks: 20, target: 180, missing: 130, total: 150 });
  for (const [current, goal, expected] of [[152, 180, 280], [179.9, 180, 1], [179.91, 180, 1],
    [180, 180, 0], [200, 180, 0], [199.99, 200, 1], [180.01, 180.1, 1], [0, 200, 2000]]) {
    const result = K.calculate(current, 20, goal);
    assert.equal(result.missing, expected);
    if (expected) {
      assert.ok(Math.round(current * 100) + expected * 10 >= Math.round(goal * 100));
      assert.ok(Math.round(current * 100) + (expected - 1) * 10 < Math.round(goal * 100));
    }
  }
  assert.equal(K.targetValue("180,5"), 180.5);
  for (const invalid of ["", "NaN", "-1", "200.1", "180.01", Infinity, null]) {
    assert.throws(() => K.targetValue(invalid), /Cieľ/);
  }
  assert.throws(() => K.calculate(NaN, 20, 180), /Neplatná/);
  assert.throws(() => K.calculate(180, -1, 180), /Neplatná/);
});

test("park budget reads exact price and balance, including decimals and exact affordability", () => {
  const budget = K.readBudget(buildings());
  assert.equal(budget.price, 3062400);
  assert.equal(budget.balance, 110134870500);
  assert.deepEqual(K.budgetFor({ price: 1234, balance: 3702 }, 3), { cost: 3702, remaining: 0 });
  assert.equal(K.budgetFor({ price: 1234, balance: 3701 }, 3).remaining, -1);
  assert.equal(K.readBudget(buildings({ price: "30\u00a0624,50" })).price, 3062450);
  assert.throws(() => K.readBudget(buildings({ price: "???" })), /cenu parku/);
  assert.throws(() => K.readBudget(buildings({ balance: "" })), /zostatok/);
  assert.throws(() => K.budgetFor({ price: Number.MAX_SAFE_INTEGER }, 2), /rozsahu/);
});

test("refresh immediately shows pending buildings, per-planet progress and completed controls", async t => {
  locationFor(t);
  const ui = container();
  let releaseBuildings;
  let releaseDetail;
  let detailStarted;
  const started = new Promise(resolve => { detailStarted = resolve; });
  const module = K.mount(ui, {
    storage: { get: async () => null, set: async () => {} },
    getDocument: () => new Promise(resolve => { releaseBuildings = resolve; }),
    postDocument: (url, body, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      if (body.get("planeta") === "1") {
        detailStarted();
        return new Promise(resolve => { releaseDetail = resolve; });
      }
      return Promise.resolve(detail());
    }
  });
  await module.draftsReady;
  const loading = module.load();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /Načítavam zoznam/);
  assert.equal(ui.querySelector("#sgo-parks-load").textContent, "Prebieha operácia…");
  assert.equal(ui["aria-busy"], "true");
  assert.equal(ui.querySelector("#sgo-parks-stop").hidden, false);
  assert.equal(ui.querySelector("#sgo-parks-progress").hidden, false);
  assert.equal(ui.querySelector("#sgo-parks-progress").value, undefined, "indeterminate before list response");
  releaseBuildings(buildings());
  await started;
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /1\/2: Alpha/);
  assert.equal(ui.querySelector("#sgo-parks-progress").max, 2);
  assert.equal(ui.querySelector("#sgo-parks-progress").value, 0);
  releaseDetail(detail("1", "167", 20, "Alpha"));
  await loading;
  assert.equal(ui.querySelector("#sgo-parks-progress").value, 2);
  assert.equal(ui.querySelector("#sgo-parks-progress").hidden, true);
  assert.equal(ui.querySelector("#sgo-parks-load").textContent, "Obnoviť údaje");
  assert.equal(ui["aria-busy"], "false");
});

test("a hung buildings request times out with an explicit error and allows retry", async t => {
  locationFor(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ui = container();
  let signal;
  let fail = true;
  const module = K.mount(ui, {
    storage: { get: async () => null, set: async () => {} },
    getDocument: (url, options) => {
      signal = options.signal;
      return fail ? new Promise(() => {}) : Promise.resolve(buildings());
    },
    postDocument: async (url, body) => detail(body.get("planeta"), "167", 20, body.get("planeta") === "1" ? "Alpha" : "Beta")
  });
  await module.draftsReady;
  const loading = module.load();
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(30000);
  await loading;
  assert.equal(signal.aborted, true);
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /30 sekúnd/);
  assert.equal(ui.querySelector("#sgo-parks-load").disabled, false);
  assert.equal(module.isWorking, false);
  fail = false;
  await module.load();
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /Prepočítané 2\/2/);
});

test("stop during buildings fetch keeps the previous snapshot and does not start details", async t => {
  locationFor(t);
  const f = bulkFixture();
  await f.module.load();
  let release;
  const next = K.mount(f.ui, {
    ...f.options,
    getDocument: () => new Promise(resolve => { release = resolve; }),
    postDocument: async () => assert.fail("stopped request must not start planet details")
  });
  await next.draftsReady;
  const loading = next.load();
  await new Promise(resolve => setImmediate(resolve));
  f.ui.querySelector("#sgo-parks-stop").listeners.click();
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /Zastavujem/);
  release(buildings());
  await loading;
  assert.equal(f.ui.querySelector("#sgo-parks-list").children.length, 2);
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /zostal zachovaný/);
});

test("a hung detail stops the scan instead of timing out every remaining planet", async t => {
  locationFor(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ui = container();
  let calls = 0;
  const module = K.mount(ui, {
    storage: { get: async () => null, set: async () => {} },
    getDocument: async () => buildings(),
    postDocument: () => { calls++; return new Promise(() => {}); }
  });
  await module.draftsReady;
  const loading = module.load();
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(30000);
  await loading;
  assert.equal(calls, 1);
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /Detail Alpha.*30 sekúnd/);
  assert.equal(ui.querySelector("#sgo-parks-stop").hidden, true);
});

test("readers verify park effect, selected planet, exact name, current parks and happiness", () => {
  const planets = K.readPlanets(buildings());
  assert.deepEqual(planets[1], { id: "2", name: "Beta", parks: 20, factories: 100, freeSlots: 500 });
  assert.equal(K.readDetail(detail(), planets[1], 180).missing, 130);
  assert.equal(K.readDetail(detail("2", "167,00", 20, "Beta (DP)"), { ...planets[1], name: "Beta (DP)" }, 180).missing, 130);
  assert.equal(K.readDetail(detail("2", "167", 20, "Beta (DP)"), planets[1], 180).missing, 130);
  assert.throws(() => K.readPlanets(buildings({ effect: "+0.2 spokojenost" })), /účinok/);
  assert.throws(() => K.readDetail(detail("1"), planets[1], 180), /nezodpovedá/);
  assert.throws(() => K.readDetail(detail("2", "167", 20, "Renamed"), planets[1], 180), /nezodpovedá/);
  assert.throws(() => K.readDetail(detail("2", "167", 21), planets[1], 180), /zmenil/);
  assert.throws(() => K.readDetail(detail("2", "???"), planets[1], 180), /spokojnosť/);
});

test("park prefill only selects construction mode and parks and refuses drafts or insufficient space", () => {
  const doc = buildings();
  const report = K.readDetail(detail(), K.readPlanets(doc)[1], 180);
  K.fill(doc, report);
  assert.equal(doc.fields.planeta.value, "2");
  assert.equal(doc.fields.verze.value, "0");
  assert.equal(doc.fields.parku.value, "130");
  assert.equal(doc.fields.vyroben.value, "");
  const unfinished = buildings();
  unfinished.fields.vyroben.value = "12";
  assert.throws(() => K.fill(unfinished, report), /rozpracované/);
  assert.equal(unfinished.fields.planeta.value, "1");
  const tight = buildings({ free: 129 });
  K.fill(tight, report);
  assert.equal(tight.fields.vyroben.value, "-1");
  assert.equal(tight.fields.parku.value, "130");
  assert.throws(() => K.fill(buildings({ free: 0 }), report), /dosť výroben/);
  assert.throws(() => K.fill(buildings({ parks: 21 }), report), /zmenili/);
  assert.throws(() => K.fill(doc, { ...report, missing: 0 }), /spĺňa/);
});

test("parks settings persist, reports recalculate and draft revalidates on destination without building", async t => {
  locationFor(t);
  const saved = new Map();
  const drafts = new Map();
  const storage = { get: async key => saved.get(key), set: async (key, value) => saved.set(key, value) };
  const session = {
    getItem: key => drafts.get(key) || null, setItem: (key, value) => drafts.set(key, value),
    removeItem: key => drafts.delete(key)
  };
  const ui = container();
  let destination;
  let detailCalls = 0;
  let happiness = "167.00";
  const options = {
    storage, session, getDocument: async () => buildings(), log() {},
    postDocument: async (url, body) => {
      detailCalls++;
      assert.equal(new URL(url).searchParams.get("s"), "detail", "POST is only the view selector");
      assert.equal(body.get("vyberpl"), "Vyber planetu");
      assert.equal(body.has("postavit"), false);
      return detail(body.get("planeta"), happiness, 20, body.get("planeta") === "1" ? "Alpha" : "Beta");
    },
    navigate: async url => { destination = url; }
  };
  const module = K.mount(ui, options);
  await module.ready;
  assert.equal(detailCalls, 0);
  assert.equal(ui.querySelector("#sgo-parks-target").value, "180");
  await module.load();
  assert.equal(detailCalls, 2);
  assert.match(ui.innerHTML, /<details class="sgo-watch-settings"><summary>Nastavenia parkov/);
  const restored = container();
  await K.mount(restored, options).draftsReady;
  assert.equal(restored.querySelector("#sgo-parks-list").children.length, 2);
  assert.equal(detailCalls, 2, "navigation restores snapshot without requests");
  assert.match(restored.querySelector("#sgo-parks-status").textContent, /neaktuálne/);
  const row = () => ui.querySelector("#sgo-parks-list").children[1];
  assert.equal(row().children[1].children[1].children[0].textContent, "+130 parkov");
  assert.equal(row().children[1].children[1].children[1].textContent, "20 → 150");
  ui.querySelector("#sgo-parks-target").value = "190";
  await ui.querySelector("#sgo-parks-save").listeners.click();
  assert.equal(saved.get("sgo-parks-target"), 190);
  assert.equal(detailCalls, 2);
  assert.equal(row().children[1].children[1].children[0].textContent, "+230 parkov");
  await row().children[2].listeners.click();
  assert.match(destination, /page=planety$/);
  globalThis.location.href = destination;
  happiness = "180.00";
  const native = buildings();
  const next = container(native);
  let revealed = false;
  await K.mount(next, { ...options, revealGame: () => { revealed = true; } }).draftsReady;
  assert.equal(native.fields.parku.value, "100", "fresh detail used, not stale report amount");
  assert.equal(native.fields.planeta.value, "2");
  assert.equal(revealed, true);
  assert.equal(drafts.size, 0);
  assert.equal(next.querySelector("#sgo-parks-target").value, "190");
  assert.equal(next.querySelector("#sgo-parks-list").children.length, 1, "only successfully prefilled row is hidden");
  const unconfirmed = container();
  await K.mount(unconfirmed, options).draftsReady;
  assert.equal(unconfirmed.querySelector("#sgo-parks-list").children.length, 2, "unconfirmed prefill returns on refresh");
  assert.equal(unconfirmed.ownerDocument.fields.parku.value, "", "refresh never repeats a consumed draft");
  const confirmed = container(buildings({ parks: 120 }));
  await K.mount(confirmed, {
    ...options,
    postDocument: async (url, body) => detail(body.get("planeta"), "190.00", 120,
      body.get("planeta") === "1" ? "Alpha" : "Beta")
  }).draftsReady;
  assert.equal(confirmed.querySelector("#sgo-parks-list").children.length, 0, "confirmed target is removed");
  globalThis.location.href = "https://game.test/game.php?page=prehled";
  const after = container();
  await K.mount(after, options).draftsReady;
  assert.equal(after.querySelector("#sgo-parks-list").children.length, 0, "confirmed completion persists");
});

test("planet errors are explicit, other planets continue and scan can stop", async t => {
  locationFor(t);
  const ui = container();
  let module;
  let stop = false;
  module = K.mount(ui, {
    storage: { get: async () => null, set: async () => {} }, getDocument: async () => buildings(), log() {},
    postDocument: async (url, body) => {
      if (stop) ui.querySelector("#sgo-parks-stop").listeners.click();
      if (body.get("planeta") === "1") throw new Error("Offline");
      return detail();
    }
  });
  await module.load();
  assert.equal(ui.querySelector("#sgo-parks-list").children.length, 1);
  assert.match(ui.querySelector("#sgo-parks-errors").textContent, /Alpha: Offline/);
  stop = true;
  await module.load();
  assert.equal(ui.querySelector("#sgo-parks-list").children.length, 0);
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /Zastavené 1\/2/);
});

test("prefill from a detail page navigates to construction and failures never hide rows", async t => {
  locationFor(t, "https://game.test/www/game.php?page=planety&s=detail&planeta=1");
  const saved = new Map();
  const drafts = new Map();
  const options = {
    storage: { get: async key => saved.get(key), set: async (key, value) => saved.set(key, structuredClone(value)) },
    session: { getItem: key => drafts.get(key), setItem: (key, value) => drafts.set(key, value), removeItem: key => drafts.delete(key) },
    getDocument: async () => buildings(),
    postDocument: async (url, body) => detail(body.get("planeta"), "167", 20, body.get("planeta") === "1" ? "Alpha" : "Beta")
  };
  const ui = container();
  let destination;
  const module = K.mount(ui, { ...options, navigate: async url => { destination = url; throw new Error("Navigation failed"); } });
  await module.load();
  const click = panel => panel.querySelector("#sgo-parks-list").children[1].children[2].listeners.click();
  await click(ui);
  assert.equal(destination, "https://game.test/www/game.php?page=planety");
  assert.equal(drafts.size, 0);
  assert.equal(ui.querySelector("#sgo-parks-list").children.length, 2);
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /Navigation failed/);
  const next = container();
  next.ownerDocument.fields.vyroben.value = "5";
  globalThis.location.href = destination;
  await K.mount(next, options).draftsReady;
  await click(next);
  assert.match(next.querySelector("#sgo-parks-status").textContent, /rozpracované/);
  assert.equal(next.querySelector("#sgo-parks-list").children.length, 2);
  assert.equal(next.ownerDocument.fields.parku.value, "");
});

test("expired drafts, failed settings and blocked operations never prefill or fetch details", async t => {
  locationFor(t, "https://game.test/game.php?page=planety");
  const ui = container();
  let removed = false;
  await K.mount(ui, {
    storage: { get: async () => null },
    session: {
      getItem: () => JSON.stringify({ id: "2", name: "Beta", target: 180, time: Date.now() - 600001 }),
      removeItem: () => { removed = true; }
    },
    postDocument: async () => assert.fail("expired draft must not fetch")
  }).draftsReady;
  assert.equal(removed, true);
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /vypršalo/);
  assert.equal(ui.ownerDocument.fields.parku.value, "");
  const failed = container();
  const module = K.mount(failed, {
    storage: { get: async () => { throw new Error("Read failed"); } },
    getDocument: async () => assert.fail("must not fetch")
  });
  assert.equal(await module.ready, false);
  assert.match(failed.querySelector("#sgo-parks-status").textContent, /Read failed/);
  await module.load();
  assert.match(failed.querySelector("#sgo-parks-status").textContent, /Nastavenia/);
  globalThis.location.href = "https://game.test/game.php?page=prehled";
  const blocked = container();
  await K.mount(blocked, {
    storage: { get: async () => null }, canEdit: () => false,
    getDocument: async () => assert.fail("busy operation must not fetch")
  }).load();
  assert.match(blocked.querySelector("#sgo-parks-status").textContent, /prebiehajúcu operáciu/);
});

function bulkFixture(overrides = {}) {
  const states = new Map([
    ["1", { parks: 20, factories: 200, free: 30, happiness: 167, name: "Alpha" }],
    ["2", { parks: 20, factories: 200, free: 500, happiness: 167, name: "Beta" }]
  ]);
  const saved = new Map();
  const submissions = [];
  const pauses = [];
  const ui = container();
  const options = {
    storage: {
      get: async key => structuredClone(saved.get(key)),
      set: async (key, value) => saved.set(key, structuredClone(value))
    },
    getDocument: async () => {
      const doc = buildings();
      doc.getElementById = id => buildings(states.get(id.slice(3))).getElementById(id);
      return doc;
    },
    postDocument: async (url, body) => {
      const state = states.get(body.get("planeta"));
      if (new URL(url).searchParams.has("s")) {
        return detail(body.get("planeta"), String(state.happiness), state.parks, state.name);
      }
      const parks = Number(body.get("parku"));
      const factories = Number(body.get("vyroben") || 0);
      submissions.push(new URLSearchParams(body));
      state.parks += parks;
      state.factories += factories;
      state.free -= parks + factories;
      state.happiness = 180;
      return {};
    },
    withLock: async action => action(), delayFn: () => 3456,
    sleep: async ms => pauses.push(ms),
    ...overrides
  };
  const module = K.mount(ui, options);
  return { states, saved, submissions, pauses, ui, module, options };
}

test("bulk builds only selected deficits, frees the exact factory shortfall and verifies every POST", async t => {
  locationFor(t);
  const f = bulkFixture();
  await f.module.load();
  await f.ui.querySelector("#sgo-parks-all").listeners.click();
  assert.equal(f.ui.querySelector("#sgo-parks-build").textContent, "Postaviť označené (2)");
  assert.equal(f.ui.querySelector("#sgo-parks-totals").textContent, "+260 parkov · −100 výroben");
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent, /Stačí na všetky/);
  assert.equal(f.ui.querySelector("#sgo-parks-selected").textContent, "Vybrané 2");
  const card = f.ui.querySelector("#sgo-parks-list").children[0];
  assert.equal(card["data-selected"], "true");
  assert.equal(card.children[0]["aria-label"], "Vybrať Alpha");
  assert.equal(card.children[1].children[2].textContent, "Uvoľní miesto: −100 výroben");
  await f.module.buildSelected();
  assert.equal(f.submissions.length, 2);
  assert.equal(f.submissions[0].get("vyroben"), "-100");
  assert.equal(f.submissions[0].get("parku"), "130");
  assert.equal(f.submissions[0].get("verze"), "0");
  assert.equal(f.submissions[1].get("vyroben"), "");
  assert.equal(f.submissions[1].get("planeta"), "2");
  assert.deepEqual(f.pauses, [3456]);
  assert.equal(f.saved.get("sgo-parks-pending"), null);
  assert.equal(f.ui.querySelector("#sgo-parks-list").children.length, 0);
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /overených stavieb 2\/2/);
  await f.module.buildSelected();
  assert.equal(f.submissions.length, 2, "completed planets never submitted again");
});

test("bulk individual checkbox, select all and clear only affect eligible planets", async t => {
  locationFor(t);
  const f = bulkFixture();
  f.states.get("1").happiness = 190;
  await f.module.load();
  const list = f.ui.querySelector("#sgo-parks-list");
  assert.equal(list.children.length, 1, "satisfied planet is hidden");
  const checkbox = list.children[0].children[0];
  checkbox.checked = true;
  checkbox.listeners.change();
  await f.module.buildSelected();
  assert.equal(f.submissions.length, 1);
  assert.equal(f.submissions[0].get("planeta"), "2");
  f.states.get("2").happiness = 170;
  await f.module.load();
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  f.ui.querySelector("#sgo-parks-none").listeners.click();
  assert.equal(f.ui.querySelector("#sgo-parks-totals").textContent, "Označ planéty, ktoré chceš upraviť.");
  assert.equal(f.ui.querySelector("#sgo-parks-build").disabled, true);
  await f.module.buildSelected();
  assert.equal(f.submissions.length, 1);
});

test("stop during cooldown sends no further builds", async t => {
  locationFor(t);
  const f = bulkFixture();
  f.options.sleep = async () => f.ui.querySelector("#sgo-parks-stop").listeners.click();
  const module = K.mount(f.ui, f.options);
  await module.load();
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  await module.buildSelected();
  assert.equal(f.submissions.length, 1);
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /Zastavené/);
});

test("lost POST response retains journal, stops queue and never blindly retries", async t => {
  locationFor(t);
  const f = bulkFixture();
  const post = f.options.postDocument;
  let attempts = 0;
  const module = K.mount(f.ui, {
    ...f.options,
    postDocument: async (url, body) => {
      if (!new URL(url).searchParams.has("s")) { attempts++; throw new Error("Connection lost"); }
      return post(url, body);
    }
  });
  await module.load();
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  await module.buildSelected();
  assert.equal(attempts, 1);
  assert.equal(f.saved.get("sgo-parks-pending").id, "1");
  await module.buildSelected();
  assert.equal(attempts, 1);
  assert.match(f.ui.querySelector("#sgo-parks-status").textContent, /Neistý výsledok/);
});

test("lost response after successful construction is reconciled on the next run without duplicate demolition", async t => {
  locationFor(t);
  const f = bulkFixture();
  const post = f.options.postDocument;
  const first = K.mount(f.ui, {
    ...f.options,
    postDocument: async (url, body) => {
      const result = await post(url, body);
      if (!new URL(url).searchParams.has("s")) throw new Error("Response lost");
      return result;
    }
  });
  await first.load();
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  await first.buildSelected();
  assert.equal(f.submissions.length, 1);
  assert.ok(f.saved.get("sgo-parks-pending"));
  const next = K.mount(f.ui, f.options);
  await next.draftsReady;
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  await next.buildSelected();
  assert.equal(f.submissions.length, 2);
  assert.deepEqual(f.submissions.map(body => body.get("planeta")), ["1", "2"]);
  assert.equal(f.saved.get("sgo-parks-pending"), null);
});

test("freshly satisfied planets and insufficient factory reserves are never submitted", async t => {
  locationFor(t);
  const f = bulkFixture();
  f.states.get("2").factories = 0;
  f.states.get("2").free = 0;
  await f.module.load();
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  assert.equal(f.ui.querySelector("#sgo-parks-build").textContent, "Postaviť označené (1)");
  f.states.get("1").happiness = 180;
  await f.module.buildSelected();
  assert.equal(f.submissions.length, 0, "fresh detail prevents stale construction");
});

test("legacy snapshots show one actionable notice instead of long disabled row buttons", async t => {
  locationFor(t);
  const f = bulkFixture();
  await f.module.load();
  const snapshot = f.saved.get("sgo-parks-snapshot");
  for (const row of snapshot.rows) delete row.report.factories;
  const next = K.mount(f.ui, f.options);
  await next.draftsReady;
  assert.equal(f.ui.querySelector("#sgo-parks-legacy").hidden, false);
  assert.equal(f.ui.querySelector("#sgo-parks-count").textContent, "Planéty pod cieľom: 2");
  for (const card of f.ui.querySelector("#sgo-parks-list").children) {
    assert.equal(card.children[0].disabled, true);
    assert.equal(card.children[2].textContent, "Predvyplniť");
    assert.equal(card.children[2].disabled, true);
  }
  assert.equal(f.ui.querySelector("#sgo-parks-all").disabled, true);
  await next.load();
  assert.equal(f.ui.querySelector("#sgo-parks-legacy").hidden, true);
  assert.equal(f.ui.querySelector("#sgo-parks-all").disabled, false);
});

test("selection budget updates on checkbox changes, refresh and restored snapshots without scanning", async t => {
  locationFor(t);
  const f = bulkFixture();
  await f.module.load();
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  assert.equal(f.saved.get("sgo-parks-snapshot").budget.price, 3062400);
  const next = K.mount(f.ui, {
    ...f.options,
    getDocument: async () => buildings({ balance: "1 000" })
  });
  await next.draftsReady;
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent, /Stačí na všetky/);
  await f.ui.querySelector("#sgo-parks-budget-refresh").listeners.click();
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent, /Chýba/);
  assert.equal(f.ui.querySelector("#sgo-parks-budget").className, "sgo-hint sgo-error");
  const card = f.ui.querySelector("#sgo-parks-list").children[0];
  card.children[0].checked = false;
  card.children[0].listeners.change();
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent.replace(/\s/g, ""), /3981120/);
  f.ui.querySelector("#sgo-parks-none").listeners.click();
  assert.equal(f.ui.querySelector("#sgo-parks-budget").hidden, true);
});

test("missing or failed budget refresh never reports enough naq from stale data", async t => {
  locationFor(t);
  const f = bulkFixture();
  await f.module.load();
  let fails = false;
  const next = K.mount(f.ui, {
    ...f.options,
    getDocument: async () => {
      if (fails) throw new Error("Offline");
      return buildings({ price: "???" });
    }
  });
  await next.draftsReady;
  f.ui.querySelector("#sgo-parks-all").listeners.click();
  await f.ui.querySelector("#sgo-parks-budget-refresh").listeners.click();
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent, /cenu parku/);
  assert.doesNotMatch(f.ui.querySelector("#sgo-parks-budget").textContent, /Stačí/);
  fails = true;
  await f.ui.querySelector("#sgo-parks-budget-refresh").listeners.click();
  assert.match(f.ui.querySelector("#sgo-parks-budget").textContent, /Offline/);
  assert.equal(f.ui.querySelector("#sgo-parks-build").disabled, false, "budget remains informational");
});

test("bulk recalculates fresh, refuses insufficient factories, failed storage and foreign actions", async t => {
  locationFor(t);
  for (const failure of ["factories", "storage", "action", "verification"]) {
    const f = bulkFixture();
    await f.module.load();
    f.ui.querySelector("#sgo-parks-all").listeners.click();
    if (failure === "factories") f.states.get("1").factories = 1;
    if (failure === "storage") {
      const set = f.options.storage.set;
      f.options.storage.set = async (key, value) => {
        if (key === "sgo-parks-pending") throw new Error("Storage failed");
        return set(key, value);
      };
    }
    if (failure === "action") {
      const get = f.options.getDocument;
      f.options.getDocument = async () => {
        const doc = await get();
        doc.forms[0].getAttribute = () => "https://other.test/game.php?page=planety";
        return doc;
      };
    }
    if (failure === "verification") {
      const post = f.options.postDocument;
      f.options.postDocument = async (url, body) => new URL(url).searchParams.has("s") ? post(url, body) : {};
    }
    const next = K.mount(f.ui, f.options);
    await next.draftsReady;
    f.ui.querySelector("#sgo-parks-all").listeners.click();
    await next.buildSelected();
    assert.equal(f.submissions.length, 0, failure);
    assert.ok(f.ui.querySelector("#sgo-parks-status").className.includes("sgo-error"), failure);
    if (failure === "verification") assert.equal(f.saved.get("sgo-parks-pending"), null, "verified no-op can be retried explicitly");
  }
});
