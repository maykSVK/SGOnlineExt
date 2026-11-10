const { test } = require("node:test");
const assert = require("node:assert/strict");
const P = require("../population.js");
const costs = { vyroben: 36000, sdi: 26000, bs: 30000, laboratori: 35000 };
const planet = { id: "1", name: "Solna", type: "21", cities: 198, factories: 15000, sdi: 0, bs: 0, labs: 0, built: 15000, slots: 39600 };

test("full occupancy has no denominator in game DOM", () => {
  assert.deepEqual(P.occupancy("39 600", 39600), [39600, 39600]);
  assert.deepEqual(P.occupancy("39\u00a0600", 39600), [39600, 39600]);
  assert.deepEqual(P.occupancy("15 000 / 39 600", 39600), [15000, 39600]);
  assert.throws(() => P.occupancy("15 000", 39600));
  assert.throws(() => P.occupancy("nezname", 39600));
  const full = P.calculate({ ...planet, factories: 39600, built: 39600 }, 50, costs, { room: 0 });
  assert.equal(full.targetFactories, 33000);
  assert.equal(full.missing, 0);
  assert.equal(full.excess, 6600);
  const fullBelowTarget = P.calculate({ ...planet, factories: 39600, built: 39600 }, 0, costs, { room: 0 });
  assert.equal(fullBelowTarget.targetFactories, 49500);
  assert.equal(fullBelowTarget.missing, 0);
  assert.equal(fullBelowTarget.missingWorkers, 0);
  assert.equal(fullBelowTarget.buildableNow, 0);
});

test("ideal population converts to factories using daily growth and rounds down", () => {
  const result = P.calculate(planet, 50, costs, { room: 1242000000 });
  assert.equal(result.capacity, 1782000000);
  assert.equal(result.constant, 1.5);
  assert.equal(result.idealPopulation, 1188000000);
  assert.equal(result.idealBirths, 594000000);
  assert.equal(result.targetFactories, 33000);
  assert.equal(result.missing, 18000);
  assert.equal(result.population, 540000000);
  assert.equal(result.unemployed, 0);
  assert.equal(result.missingWorkers, 648000000);
  assert.equal(result.buildableNow, 0);
  assert.equal(result.freeSlots, 24600);
});

test("other employers count toward target, never demolish excess factories", () => {
  const changed = { ...planet, sdi: 10, bs: 20, labs: 30, built: 15060 };
  const result = P.calculate(changed, 50, costs, { room: 1200000000 });
  assert.equal(result.otherEmployed, 1910000);
  assert.equal(result.targetFactories, Math.floor((1188000000 - 1910000) / 36000));
  assert.ok(result.targetFactories * 36000 + result.otherEmployed <= result.idealPopulation);
  assert.ok((result.targetFactories + 1) * 36000 + result.otherEmployed > result.idealPopulation);
  const excess = P.calculate({ ...planet, factories: 35000, built: 35000 }, 50, costs, { room: 0 });
  assert.equal(excess.missing, 0);
  assert.equal(excess.excess, 2000);
});

test("prefill target is not clamped to available workers or building slots", () => {
  const result = P.calculate({ ...planet, slots: 15010 }, 50, costs, { room: 1241280000 });
  assert.equal(result.missing, 18000);
  assert.equal(result.unemployed, 720000);
  assert.equal(result.buildableNow, 10);
  assert.equal(result.missingWorkers, 647280000);
});

test("zero growth, fractional growth, missing inputs and inconsistent snapshots", () => {
  assert.equal(P.calculate(planet, 0, costs, { room: 0 }).targetFactories, 49500);
  assert.equal(P.calculate(planet, 0, costs, { room: 0 }).idealBirths, 0);
  const fractional = P.calculate(planet, 12.5, costs, { room: 0 });
  assert.equal(fractional.constant, 1.125);
  assert.equal(fractional.idealBirths, Math.floor(fractional.idealPopulation * 0.125));
  for (const growth of [undefined, NaN, -1]) assert.throws(() => P.calculate(planet, growth, costs, { room: 0 }));
  assert.throws(() => P.calculate(planet, 50, costs, {}));
  assert.throws(() => P.calculate(planet, 50, costs, { room: 1782000000 }));
  assert.throws(() => P.calculate(planet, 50, { ...costs, vyroben: 0 }, { room: 0 }));
});

test("birth potential accounts for size and growth, not just percentage or current population", () => {
  const large = P.calculate({ ...planet, cities: 300 }, 50, costs, { room: 0 });
  const small = P.calculate({ ...planet, cities: 100 }, 100, costs, { room: 0 });
  assert.equal(large.idealBirths, 900000000);
  assert.equal(small.idealBirths, 450000000);
  assert.ok(large.idealBirths > small.idealBirths);
  assert.equal(P.calculate(planet, 50, costs, { room: 1242000000 }).idealBirths,
    P.calculate(planet, 50, costs, { room: 0 }).idealBirths);
});

test("upgraded city capacity from Město card is used instead of hardcoded 9 000 000", () => {
  const aafm = { id: "2382098", name: "AAFM-6757-45", type: "5", cities: 678, factories: 105937, sdi: 0, bs: 0, labs: 0, built: 105937, slots: 142380 };
  assert.throws(() => P.calculate(aafm, 50, costs, { room: 2613708000 }), /zmenili alebo nesúhlasia/);
  const upgraded = P.calculate(aafm, 50, { ...costs, mest: 9480000 }, { room: 2613708000 });
  assert.equal(upgraded.capacity, 6427440000);
  assert.equal(upgraded.population, 3813732000);
  assert.equal(upgraded.unemployed, 0);
  assert.equal(upgraded.targetFactories, 119026);
  assert.equal(upgraded.missing, 13089);
});

test("population selection follows native building form without selecting another planet when done", async t => {
  class Element {
    constructor() {
      this.children = [];
      this.listeners = {};
      this.value = "";
      this.classList = { toggle() {} };
    }
    append(...children) { this.children.push(...children); }
    prepend(child) { this.children.unshift(child); }
    replaceChildren(...children) {
      this.children = children;
      this.value = children[0]?.value || "";
    }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    scrollIntoView() {}
  }
  const native = new Element();
  native.value = "2";
  native.options = [{ value: "1", textContent: "Alpha" }, { value: "2", textContent: "Beta" }];
  Object.defineProperty(native, "selectedOptions", { get: () => native.options.filter(o => o.value === native.value) });
  const form = {
    querySelector(selector) {
      if (selector.includes("planeta")) return native;
      if (selector.includes("postavit")) return {};
      const name = selector.match(/name="(.+)"/)?.[1];
      return costs[name] ? { closest: () => ({ textContent: `- ${costs[name]} lidí` }) } : null;
    }
  };
  const cell = textContent => ({ textContent });
  const buildings = {
    forms: [form],
    getElementById(id) {
      return { cells: [
        { querySelector: () => ({ getAttribute: () => "?typ=21" }) },
        cell(""), cell(id === "pln1" ? "100" : "198"), cell(id === "pln2" && done ? "39 600 / 39 600" : "15 000 / 39 600"),
        cell("0"), cell("0"), cell("0"), cell("0"), cell("0"),
        cell(id === "pln2" && done ? "39 600" : "15 000 / 39 600")
      ] };
    }
  };
  const types = { querySelectorAll: () => [{
    getAttribute: () => "id21",
    closest: () => ({ cells: [cell(""), cell(""), cell(""), cell(""), cell("50 %")] })
  }] };
  const trade = { querySelectorAll: () => ["1", "2"].map(id => ({
    id: `p${id}`, cells: [cell(""), cell(""), cell("0"), cell("0"), cell(""), cell("")]
  })) };
  const elements = new Map();
  const container = {
    hidden: false,
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    }
  };
  const doc = { forms: [form], createElement: () => new Element(), querySelectorAll: () => [] };
  const oldDocument = globalThis.document;
  const oldLocation = globalThis.location;
  t.after(() => {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
  });
  globalThis.document = doc;
  globalThis.location = { href: "https://stargame-online.cz/www/game.php?page=planety" };
  let done = false;
  const module = P.mount(container, {
    canEdit: () => true,
    log() {},
    getDocument: async url => url.includes("s=typy") ? types : url.includes("page=obchod") ? trade : buildings
  });
  const selector = container.querySelector("#sgo-pop-planet");
  await module.refresh();
  assert.deepEqual(selector.children.map(option => option.value), ["2", "1"], "highest birth potential first");
  assert.match(selector.children[0].textContent, /ľudí\/deň/);
  assert.match(container.querySelector("#sgo-pop-list").children[0].children[0].textContent, /^Beta/);
  assert.equal(selector.value, "2", "initial selection comes from native form, not first report");
  native.value = "1";
  native.listeners.change({ target: native });
  await module.refresh();
  assert.equal(selector.value, "1", "native changes propagate to addon");
  assert.deepEqual(selector.children.map(option => option.value), ["2", "1"], "native selection does not change ranking");
  selector.value = "2";
  selector.listeners.change();
  await module.refresh();
  assert.equal(selector.value, "2", "manual addon selection survives refresh");
  native.value = "2";
  done = true;
  native.listeners.change({ target: native });
  await module.refresh();
  assert.equal(selector.value, "2", "completed native planet must not silently select Alpha");
  assert.equal(selector.children[0].textContent, "Beta · hotovo");
  assert.equal(selector.children[0].disabled, true);
  assert.match(container.querySelector("#sgo-pop-report").children[0].textContent, /nepotrebuje/);
  assert.equal(container.querySelector("#sgo-pop-list").children.length, 1, "completed planets stay out of work list");
});
