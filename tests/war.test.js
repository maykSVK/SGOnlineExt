const { test } = require("node:test");
const assert = require("node:assert/strict");
const W = require("../war.js");

function cell(textContent, title = "") {
  return {
    textContent,
    querySelector: selector => selector === "img" && title ? { getAttribute: name => name === "title" ? title : "" } : null
  };
}

function row(cells, link = null) {
  return {
    cells,
    querySelector: selector => selector.includes("planeta=") ? link : null
  };
}

test("army reader extracts own and race universal counts and calculates only the missing amount", () => {
  const input = { closest: () => ({ textContent: "Je v RA215 000Máme 8 000Z RADo RA" }) };
  const report = W.readArmy({ querySelector: () => input });
  assert.deepEqual(report, { own: 8000, race: 215000, target: 10000, deficit: 2000 });
  assert.throws(() => W.readArmy({ querySelector: () => null }), /univerzálov/);
});

test("planet reader maps titled headers despite the extra planet-type cell in data rows", () => {
  const headers = row([
    cell("", "Název planety"), cell("", "Města na planetě"),
    cell("", "Výrobny na planetě"), cell("", "SDI na planetě"),
    cell("", "BS na planetě")
  ]);
  const href = "game.php?page=planety&planeta=123";
  const planetsRow = row([
    cell(""), cell("AAFM-1234-56"), cell("20 / 30"), cell("100"),
    cell("450"), cell("25")
  ], { getAttribute: () => href, textContent: "AAFM-1234-56" });
  const table = { rows: [headers, planetsRow] };
  const planets = W.readPlanets({ querySelector: selector => selector === "table.planet-build-table" ? table : null }, "https://game.test/game.php");
  assert.deepEqual(planets[0], {
    id: "123", name: "AAFM-1234-56", cities: 20, maxCities: 30, sdi: 450, bs: 25,
    sdiDeficit: 50, bsDeficit: 475, cityDeficit: 10
  });
});

test("planet reader leaves an undisclosed city maximum unknown rather than guessing", () => {
  const headers = row([
    cell("", "Název planety"), cell("", "Města na planetě"),
    cell("", "SDI na planetě"), cell("", "BS na planetě")
  ]);
  const planetsRow = row(
    [cell(""), cell("AABB-1234-56"), cell("20"), cell("0"), cell("0")],
    { getAttribute: () => "game.php?page=planety&planeta=4", textContent: "AABB-1234-56" }
  );
  const planets = W.readPlanets({
    querySelector: selector => selector === "table.planet-build-table" ? { rows: [headers, planetsRow] } : null
  }, "https://game.test/game.php");
  assert.equal(planets[0].maxCities, null);
  assert.equal(planets[0].cityDeficit, null);
});

test("spy reader includes successful and failed spy results only for the configured defender", () => {
  const day = { cells: [cell("» 13. 11. 2026:")] };
  const attack = (time, attacker, defender, result) => ({ cells: [time, attacker, defender, result].map(value => cell(value)) });
  const rows = [
    day,
    attack("09:10:00", "Enemy", "mayk (Terrané)", "zjistil informace na planetě „AAFM-1234-56“"),
    attack("09:11:00", "Enemy", "mayk (Terrané)", "nezjistil informace na planetě „AABB-1234-56“"),
    attack("09:12:00", "Enemy", "Other (Terrané)", "zjistil informace na planetě „AABB-1234-56“"),
    attack("09:13:00", "Enemy", "mayk (Terrané)", "ukradl lidi na planetě „AABB-1234-56“")
  ];
  const result = W.readSpies({ querySelectorAll: () => rows }, "mayk");
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(entry => entry.planet), ["AAFM-1234-56", "AABB-1234-56"]);
  assert.notEqual(result[0].id, result[1].id);
});

test("spy history deduplicates entries and retains only the last 24 hours", () => {
  const now = Date.parse("2026-11-13T10:00:00");
  const recent = { id: "recent", time: now - 1000 };
  const stale = { id: "stale", time: now - 25 * 60 * 60 * 1000 };
  assert.deepEqual(W.recentSpies([recent, stale, recent], now), [recent]);
});

function makeForm(fields) {
  const map = new Map(Object.entries(fields).map(([name, initial]) => [name, {
    name,
    value: initial && typeof initial === "object" ? initial.value : initial,
    dispatchEvent() {},
    options: initial && typeof initial === "object" ? initial.options : undefined
  }]));
  return {
    elements: { namedItem: name => map.get(name) || null },
    get: name => map.get(name)
  };
}

test("draft application fills native inputs without submitting forms", () => {
  const armyForm = makeForm({ jed2z: "" });
  W.applyArmyDraft({ forms: [makeForm({ logout_token: "" }), armyForm] }, { amount: 2000 });
  assert.equal(armyForm.get("jed2z").value, "2000");

  const planetForm = makeForm({
    planeta: Object.assign({ value: "1" }, { options: [{ value: "1" }, { value: "2" }] }),
    mest: "", sdi: "", bs: ""
  });
  W.applyPlanetDraft({ forms: [planetForm] }, { planetId: "2", cities: null, sdi: 50, bs: 475 });
  assert.equal(planetForm.get("planeta").value, "2");
  assert.equal(planetForm.get("mest").value, "");
  assert.equal(planetForm.get("sdi").value, "50");
  assert.equal(planetForm.get("bs").value, "475");
});

test("planet draft fills city deficit only when the game exposes a maximum", () => {
  const form = makeForm({
    planeta: Object.assign({ value: "1" }, { options: [{ value: "1" }, { value: "2" }] }),
    mest: "", sdi: "", bs: ""
  });
  W.applyPlanetDraft({ forms: [form] }, { planetId: "2", cities: 10, sdi: 0, bs: 0 });
  assert.equal(form.get("mest").value, "10");
  assert.equal(form.get("sdi").value, "");
  assert.equal(form.get("bs").value, "");
});

test("draft application refuses to overwrite user-entered quantities", () => {
  const form = makeForm({ jed2z: "17" });
  assert.throws(() => W.applyArmyDraft({ forms: [form] }, { amount: 2000 }), /neprepísal/);
  assert.equal(form.get("jed2z").value, "17");
});

test("planet draft refuses to overwrite entered construction amounts", () => {
  const form = makeForm({
    planeta: Object.assign({ value: "1" }, { options: [{ value: "1" }, { value: "2" }] }),
    mest: "", sdi: "12", bs: ""
  });
  assert.throws(() => W.applyPlanetDraft({ forms: [form] }, { planetId: "2", cities: null, sdi: 50, bs: 475 }), /neprepísal/);
  assert.equal(form.get("planeta").value, "1");
  assert.equal(form.get("sdi").value, "12");
});
