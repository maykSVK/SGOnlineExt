const { test } = require("node:test");
const assert = require("node:assert/strict");
const K = require("../parks.js");

function buildings({ free = 500, parks = 20, effect = "+0.1 spokojenost" } = {}) {
  const fields = Object.fromEntries(["planeta", "mest", "vyroben", "sdi", "bs", "parku", "laboratori", "kasaren", "verze", "postavit"]
    .map(name => [name, { value: "", dispatchEvent() {}, closest: () => ({ textContent:
      name === "parku" ? effect : name === "mest" ? "+9 000 000 lidí" : "-36 000 lidí" }) }]));
  fields.planeta.value = "1";
  fields.planeta.options = [{ value: "1", textContent: "Alpha" }, { value: "2", textContent: "Beta" }];
  fields.verze.options = [{ value: "0" }, { value: "1" }];
  fields.verze.value = "1";
  const form = {
    elements: { namedItem: name => fields[name] },
    querySelector: selector => fields[selector.match(/name="([^"]+)"/)?.[1]] || null,
    scrollIntoView() {}
  };
  const cell = textContent => ({ textContent });
  return {
    fields, forms: [form], defaultView: { Event },
    getElementById: () => ({ cells: [
      { querySelector: () => ({ getAttribute: () => "?typ=21" }) }, cell(""),
      cell("100"), cell("100"), cell("0"), cell("0"), cell(String(parks)), cell("0"), cell("0"),
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
}

function container(doc = buildings()) {
  doc.createElement = () => new Element(doc);
  const elements = new Map();
  return {
    ownerDocument: doc, innerHTML: "",
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

test("readers verify park effect, selected planet, exact name, current parks and happiness", () => {
  const planets = K.readPlanets(buildings());
  assert.deepEqual(planets[1], { id: "2", name: "Beta", parks: 20, freeSlots: 500 });
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
  assert.throws(() => K.fill(buildings({ free: 129 }), report), /stavebné miesta/);
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
  const row = () => ui.querySelector("#sgo-parks-list").children[1];
  assert.equal(row().children[3].textContent, "+130 · spolu 150");
  ui.querySelector("#sgo-parks-target").value = "190";
  await ui.querySelector("#sgo-parks-save").listeners.click();
  assert.equal(saved.get("sgo-parks-target"), 190);
  assert.equal(detailCalls, 2);
  assert.equal(row().children[3].textContent, "+230 · spolu 250");
  await row().children[4].children[0].listeners.click();
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
});

test("planet errors are explicit, other planets continue and scan can stop", async t => {
  locationFor(t);
  const ui = container();
  let module;
  let stop = false;
  module = K.mount(ui, {
    storage: { get: async () => null }, getDocument: async () => buildings(), log() {},
    postDocument: async (url, body) => {
      if (stop) ui.querySelector("#sgo-parks-stop").listeners.click();
      if (body.get("planeta") === "1") throw new Error("Offline");
      return detail();
    }
  });
  await module.load();
  assert.equal(ui.querySelector("#sgo-parks-list").children.length, 2);
  assert.equal(ui.querySelector("#sgo-parks-list").children[0].children[3].textContent, "Offline");
  stop = true;
  await module.load();
  assert.equal(ui.querySelector("#sgo-parks-list").children.length, 1);
  assert.match(ui.querySelector("#sgo-parks-status").textContent, /Zastavené 1\/2/);
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
