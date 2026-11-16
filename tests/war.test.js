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
    sdiDeficit: 0, bsDeficit: 475, cityDeficit: 10
  });
  const custom = W.readPlanets({ querySelector: () => table }, "https://game.test/game.php", { sdi: 500, bs: 25 });
  assert.equal(custom[0].sdiDeficit, 50);
  assert.equal(custom[0].bsDeficit, 0);
});

test("defense settings allow zero and reject missing, negative, fractional or unsafe minima", () => {
  assert.deepEqual(W.defenseTargets(), { sdi: 200, bs: 500 });
  assert.deepEqual(W.defenseTargets({ sdi: 0, bs: 0 }), { sdi: 0, bs: 0 });
  for (const value of [null, {}, { sdi: "200", bs: 500 }, { sdi: -1, bs: 500 },
    { sdi: 1.5, bs: 500 }, { sdi: 200, bs: Infinity }, { sdi: 200, bs: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => W.defenseTargets(value), /celé čísla/);
  }
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
  const attacks = W.readAttacks({ querySelectorAll: () => rows }, "mayk");
  assert.equal(attacks.length, 3, "all incoming attack types are included, but not attacks on other players");
  assert.match(attacks[2].result, /ukradl lidi/);
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
    elements: { namedItem: name => map.get(name) || null, [Symbol.iterator]: () => map.values() },
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

test("owner comes from the signed-in profile link, never an arbitrary player or saved username", () => {
  const doc = { querySelector: selector => selector === '#os a[href*="hledat="]'
    ? { getAttribute: () => "game.php?page=vesmir&hledat=My%20Name" } : null };
  assert.equal(W.readOwner(doc), "My Name");
  assert.throws(() => W.readOwner({ querySelector: () => null }), /prihláseného hráča/);
  const filter = W.spyFilter("My Name");
  assert.deepEqual(Object.fromEntries(filter), {
    rasa1: "0", rasa2: "0", stav: "0", utoky: "7", texty: "2", text: "My Name", najit: "Najít"
  });
});

function spyDoc({ next = null, entries = [], owner = "mayk", filter = {}, date = "13. 11. 2026" } = {}) {
  const form = makeForm({ ...Object.fromEntries(W.spyFilter(owner)), ...filter });
  const rows = [
    { cells: [cell(`» ${date}:`)] },
    ...entries.map(({ time = "09:10:00", name = "AAFM-1234-56", result = "zjistil", defender = "mayk", text }) => ({
      cells: [time, "Enemy", `${defender} (Terrané)`, text || `${result} informace na planetě „${name}“`].map(value => cell(value))
    }))
  ];
  return {
    forms: [form],
    querySelectorAll: selector => selector === "table tr" ? rows
      : selector === "table" ? [{ querySelectorAll: () => [cell("Obránce")] }]
        : selector === "a[href]" && next ? [{ textContent: "Další »", getAttribute: () => next }] : []
  };
}

test("all-attack search uses every type and result on every page, retains older reports and deduplicates newest first", async () => {
  const calls = [];
  const docs = [
    spyDoc({ filter: { utoky: "0" }, next: "game.php?page=jednotky&strana=2",
      entries: [{ time: "09:10:00", text: "neprobil obranu" }, { time: "09:11:00" }, { defender: "Other" }] }),
    spyDoc({ filter: { utoky: "0" }, next: "game.php?page=jednotky&strana=3",
      entries: [{ time: "09:11:00" }] }),
    spyDoc({ filter: { utoky: "0" }, date: "1. 11. 2026",
      entries: [{ text: "zničil infrastrukturu planety „BBBB-1234-56“" }] })
  ];
  const entries = await W.loadAttacks("https://game.test/game.php?page=jednotky", "mayk", async (url, body) => {
    calls.push({ url, body: Object.fromEntries(body) });
    return docs[calls.length - 1];
  });
  assert.equal(calls.length, 3);
  for (const { body } of calls) {
    assert.equal(body.utoky, "0");
    assert.equal(body.stav, "0");
    assert.equal(body.texty, "2");
    assert.equal(body.text, "mayk");
  }
  assert.equal(entries.length, 3);
  assert.match(entries[0].result, /informace/);
  assert.equal(entries[1].result, "neprobil obranu");
  assert.match(entries[2].result, /zničil/);
  assert.ok(entries[2].time < Date.parse("2026-11-02T00:00:00Z"));
});

test("all-attack search rejects wrong filters, bad timestamps, pagination loops and request failures", async () => {
  const url = "https://game.test/game.php?page=jednotky";
  assert.deepEqual(await W.loadAttacks(url, "mayk", async () => spyDoc({ filter: { utoky: "0" } })), []);
  await assert.rejects(W.loadAttacks(url, "mayk", async () => spyDoc()), /nepotvrdila filter/);
  await assert.rejects(W.loadAttacks(url, "mayk", async () => spyDoc({
    filter: { utoky: "0" }, entries: [{ time: "invalid", text: "neprobil obranu" }]
  })), /dátum alebo čas/);
  await assert.rejects(W.loadAttacks(url, "mayk", async () => spyDoc({
    filter: { utoky: "0" }, next: "game.php?page=jednotky&strana=2"
  })), /opakuje/);
  await assert.rejects(W.loadAttacks(url, "mayk", async () => { throw new Error("Offline"); }), /Offline/);
});

test("spy search POSTs the native player/spy/all-results filter on every page", async () => {
  const calls = [];
  const now = Date.parse("2026-11-13T10:00:00+01:00");
  const docs = [
    spyDoc({ next: "game.php?page=jednotky&strana=2", entries: [{ result: "nezjistil" }] }),
    spyDoc({ entries: [{ name: "BBBB-2222-33" }] })
  ];
  const entries = await W.loadSpies("https://game.test/game.php?page=jednotky", "mayk", async (url, body) => {
    calls.push({ url, body: Object.fromEntries(body) });
    return docs[calls.length - 1];
  }, now);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://game.test/game.php?page=jednotky&strana=2");
  assert.equal(calls[0].body.text, "mayk");
  assert.equal(calls[1].body.utoky, "7");
  assert.equal(calls[1].body.stav, "0");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].time, Date.parse("2026-11-13T09:10:00+01:00"), "server timestamps use Prague, independent of device timezone");
});

test("empty verified spy results are valid, rejected filters and broken pagination are errors", async () => {
  const url = "https://game.test/game.php?page=jednotky";
  assert.deepEqual(await W.loadSpies(url, "mayk", async () => spyDoc()), []);
  await assert.rejects(W.loadSpies(url, "mayk", async () => spyDoc({ filter: { texty: "0" } })), /nepotvrdila filter/);
  await assert.rejects(W.loadSpies(url, "mayk", async () => spyDoc({ next: "https://other.test/game.php?page=jednotky&strana=2" })), /Nerozpoznaný odkaz/);
  await assert.rejects(W.loadSpies(url, "mayk", async () => spyDoc({ next: url })), /Nerozpoznaný odkaz/);
  await assert.rejects(W.loadSpies(url, "mayk", async () => { throw new Error("Offline"); }), /Offline/);
});

test("spy pagination stops beyond 24 hours and detects a repeating next page", async () => {
  const url = "https://game.test/game.php?page=jednotky";
  let requests = 0;
  assert.deepEqual(await W.loadSpies(url, "mayk", async () => {
    requests++;
    return spyDoc({ next: "game.php?page=jednotky&strana=2", entries: [{}] });
  }, Date.parse("2026-11-14T12:00:00+01:00")), []);
  assert.equal(requests, 1, "older reports stop traversal");
  await assert.rejects(W.loadSpies(url, "mayk", async () =>
    spyDoc({ next: "game.php?page=jednotky&strana=2" })), /opakuje/);
});

test("random names use the existing pattern, avoid collisions and fail explicitly if no free candidate", () => {
  assert.equal(W.randomPlanetName([], () => 0), "AAAA-1000-10");
  let draws = 0;
  assert.equal(W.randomPlanetName(["AAAA-1000-10"], () => draws++ < 6 ? 0 : 0.5), "NNNN-5500-55");
  assert.throws(() => W.randomPlanetName(["AAAA-1000-10"], () => 0), /voľný názov/);
  for (let n = 0; n < 100; n++) assert.match(W.randomPlanetName([]), /^[A-Z]{4}-\d{4}-\d{2}$/);
});

test("spied planets are grouped and matched by current name, never guessed for renamed or lost planets", () => {
  const spies = [{ planet: "A" }, { planet: "A" }, { planet: "B" }];
  const groups = W.spiedPlanets(spies, [{ id: "1", name: "A" }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].events.length, 2);
  assert.equal(groups[0].planet.id, "1");
  assert.equal(groups[1].planet, null);
});

function renameDoc(current = "FIRST-OLD", target = "AAFM-1234-56", input = current) {
  const form = makeForm({
    planeta: { value: "1", options: [{ value: "1", textContent: current }, { value: "2", textContent: target }] },
    novy: input, prejmenovat: "Přejmenovat", csrf: "test-token"
  });
  form.get("csrf").type = "hidden";
  return { forms: [form], form };
}
const renameDraft = { planetId: "2", oldName: "AAFM-1234-56", newName: "ZZZZ-9876-54" };

test("rename payload preserves hidden fields, supplies submit value and does not alter native inputs", () => {
  const doc = renameDoc();
  const body = W.renamePayload(doc, { id: "2", name: renameDraft.oldName }, renameDraft.newName);
  assert.deepEqual(Object.fromEntries(body), {
    csrf: "test-token", planeta: "2", novy: "ZZZZ-9876-54", prejmenovat: "Přejmenovat"
  });
  assert.equal(doc.form.get("planeta").value, "1");
  assert.equal(doc.form.get("novy").value, "FIRST-OLD");
});

test("rename payload refuses changed ownership/name, collisions, invalid names and missing forms", () => {
  for (const [doc, draft, message] of [
    [renameDoc("FIRST-OLD", "CHANGED-NAME"), renameDraft, /pôvodný názov/],
    [renameDoc(), { ...renameDraft, planetId: "missing" }, /pôvodný názov/],
    [renameDoc(), { ...renameDraft, newName: "Not a pattern" }, /neplatný/],
    [renameDoc("ZZZZ-9876-54"), renameDraft, /používa/]
  ]) {
    assert.throws(() => W.renamePayload(doc, { id: draft.planetId, name: draft.oldName }, draft.newName), message);
    assert.equal(doc.form.get("planeta").value, "1");
  }
  assert.throws(() => W.renamePayload({ forms: [] }, { id: "2", name: "OLD" }, "AAAA-1234-56"), /formulár/);
});

class Element {
  constructor(doc) { this.ownerDocument = doc; this.children = []; this.listeners = {}; this.dataset = {}; this.value = ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
}

function warContainer(nativeDoc = { forms: [] }) {
  nativeDoc.createElement = () => new Element(nativeDoc);
  nativeDoc.createTextNode = textContent => ({ textContent });
  const elements = new Map();
  const container = new Element(nativeDoc);
  container.querySelector = selector => {
    assert.notEqual(selector, "#sgo-war-owner", "there is no manual player-name field");
    if (!elements.has(selector)) elements.set(selector, new Element(nativeDoc));
    return elements.get(selector);
  };
  return container;
}

test("defense settings persist, recalculate existing planets and prefill only configured deficits", async t => {
  const oldLocation = globalThis.location;
  globalThis.location = { href: "https://game.test/game.php?page=vesmir" };
  t.after(() => { if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation; });
  const saved = new Map();
  let writeFails = false;
  let destination;
  let requests = 0;
  let networkFails = false;
  let armyFailure = "";
  const logs = [];
  const storage = {
    get: async key => saved.get(key),
    set: async (key, value) => {
      if (writeFails) throw new Error("Write failed");
      saved.set(key, value);
    }
  };
  const headers = row([cell("", "Název planety"), cell("", "Města"), cell("", "SDI"), cell("", "BS")]);
  const planet = row([cell(""), cell("AAFM-1234-56"), cell("20"), cell("200"), cell("500")],
    { textContent: "AAFM-1234-56", getAttribute: () => "game.php?page=planety&planeta=2" });
  const options = {
    log: message => logs.push(message),
    storage, navigate: async url => { destination = url; },
    getDocument: async url => {
      if (networkFails) throw new Error("Offline");
      requests++;
      const params = new URL(url).searchParams;
      if (params.get("page") === "prehled") return {
        querySelector: () => ({ getAttribute: () => "game.php?page=vesmir&hledat=mayk" })
      };
      if (params.get("akce") === "armada") {
        if (armyFailure === "network") throw new Error("Army HTTP 403");
        return { querySelector: () => armyFailure ? null
          : ({ closest: () => ({ textContent: "Je v RA20 000Máme10 000Z RADo RA" }) }) };
      }
      return { querySelector: () => ({ rows: [headers, planet] }) };
    },
    postDocument: async () => spyDoc({ filter: { utoky: "0" } })
  };
  const container = warContainer();
  const war = W.mount(container, options);
  await war.refresh();
  const input = id => container.querySelector(`#sgo-war-${id}-target`);
  const save = () => container.querySelector("#sgo-war-defense-save").listeners.click();
  const summary = container.querySelector("#sgo-war-defense-summary");
  assert.equal(input("sdi").value, "200");
  assert.equal(input("bs").value, "500");
  assert.equal(summary.textContent, "1 planét · 0 pod cieľom");
  assert.match(container.querySelector("#sgo-war-attack-summary").textContent, /0 útokov/);
  assert.match(container.querySelector("#sgo-war-attacks").children[0].children[0].textContent, /žiadne útoky/);
  const initialRequests = requests;
  input("sdi").value = "250";
  input("bs").value = "600";
  await save();
  assert.equal(requests, initialRequests, "saving recalculates without network refresh");
  assert.equal(summary.textContent, "1 planét · 1 pod cieľom");
  assert.deepEqual(saved.get("sgo-war-defense-settings"), { sdi: 250, bs: 600 });
  const defenseRow = container.querySelector("#sgo-war-planets").children[0];
  assert.equal(defenseRow.children[4].textContent, "SDI 50 · BS 100");
  assert.equal(defenseRow.children[5].children[1].textContent, "Premenovať");
  await defenseRow.children[5].children[0].listeners.click();
  assert.match(destination, /page=planety$/);
  assert.deepEqual(
    { sdi: saved.get("sgo-war-planet-draft").sdi, bs: saved.get("sgo-war-planet-draft").bs },
    { sdi: 50, bs: 100 }
  );
  const reloaded = warContainer();
  const next = W.mount(reloaded, options);
  await next.ready;
  assert.equal(requests, initialRequests, "navigation restores the complete snapshot without game requests");
  assert.match(reloaded.querySelector("#sgo-war-status").textContent, /Uložený prehľad/);
  assert.equal(reloaded.querySelector("#sgo-war-sdi-target").value, "250");
  assert.equal(reloaded.querySelector("#sgo-war-bs-target").value, "600");
  assert.equal(reloaded.querySelector("#sgo-war-defense-summary").textContent, "1 planét · 1 pod cieľom");
  networkFails = true;
  await next.refresh();
  assert.match(reloaded.querySelector("#sgo-war-status").textContent, /Offline/);
  assert.equal(reloaded.querySelector("#sgo-war-defense-summary").textContent, "1 planét · 1 pod cieľom");
  assert.equal(saved.get("sgo-war-snapshot").planets.length, 1, "failed refresh preserves persisted snapshot");
  networkFails = false;
  for (const failure of ["parser", "network"]) {
    armyFailure = failure;
    await next.refresh();
    assert.equal(saved.get("sgo-war-snapshot").army, null, "unavailable army never keeps stale counts");
    assert.match(reloaded.querySelector("#sgo-war-army").children[0].textContent, /Stav armády je neznámy/);
    assert.equal(reloaded.querySelector("#sgo-war-defense-summary").textContent, "1 planét · 1 pod cieľom");
    assert.equal(reloaded.querySelector("#sgo-war-status").dataset.state, "ok");
    assert.match(reloaded.querySelector("#sgo-war-status").textContent, /kontrola armády preskočená/);
    const restoredContainer = warContainer();
    const requestCount = requests;
    await W.mount(restoredContainer, options).ready;
    assert.equal(requests, requestCount);
    assert.match(restoredContainer.querySelector("#sgo-war-army").children[0].textContent, /Stav armády je neznámy/);
    assert.equal(restoredContainer.querySelector("#sgo-war-planets").children[0].children[5].children[1].textContent, "Premenovať");
  }
  assert.ok(logs.some(message => /kontrola armády preskočená: Army HTTP 403/.test(message)));
  armyFailure = "";
  await next.refresh();
  assert.equal(saved.get("sgo-war-snapshot").army.own, 10000);
  assert.equal(saved.get("sgo-war-snapshot").armyError, "");
  assert.match(reloaded.querySelector("#sgo-war-army").children[0].textContent, /Máme/);

  for (const invalid of ["", "-1", "1.5", "NaN", "9007199254740992"]) {
    input("sdi").value = invalid;
    await save();
    assert.equal(container.querySelector("#sgo-war-status").dataset.state, "error");
    assert.deepEqual(saved.get("sgo-war-defense-settings"), { sdi: 250, bs: 600 });
  }
  input("sdi").value = "0";
  input("bs").value = "0";
  writeFails = true;
  await save();
  assert.match(container.querySelector("#sgo-war-status").textContent, /Write failed/);
  assert.equal(summary.textContent, "1 planét · 1 pod cieľom", "failed write does not apply unsaved values");
  writeFails = false;
  await save();
  assert.equal(summary.textContent, "1 planét · 0 pod cieľom");
  assert.deepEqual(saved.get("sgo-war-defense-settings"), { sdi: 0, bs: 0 });
});

test("invalid cached overview is reported and never triggers an automatic refresh", async t => {
  const oldLocation = globalThis.location;
  globalThis.location = { href: "https://game.test/game.php?page=vesmir" };
  t.after(() => { if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation; });
  const messages = [];
  const container = warContainer();
  const war = W.mount(container, {
    storage: { get: async key => key === "sgo-war-snapshot" ? { ownerName: "mayk" } : null },
    getDocument: async () => assert.fail("cache restore must not fetch"),
    log: message => messages.push(message)
  });
  await war.ready;
  assert.equal(container.querySelector("#sgo-war-status").dataset.state, "error");
  assert.match(messages[0], /neplatný/);
  assert.equal(container.querySelector("#sgo-war-attacks").children.length, 0);
});

test("failed defense settings restore prevents refresh with misleading default targets", async t => {
  const oldLocation = globalThis.location;
  globalThis.location = { href: "https://game.test/game.php?page=vesmir" };
  t.after(() => { if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation; });
  const container = warContainer();
  const war = W.mount(container, {
    storage: { get: async () => { throw new Error("Read failed"); } },
    getDocument: async () => assert.fail("must not fetch after failed restore")
  });
  assert.equal(await war.ready, false);
  assert.match(container.querySelector("#sgo-war-status").textContent, /Read failed/);
  await war.refresh();
  assert.equal(container.querySelector("#sgo-war-status").dataset.state, "error");
});

test("direct rename is verified, persisted across navigation and re-enabled only for new attacks", async t => {
  const oldLocation = globalThis.location;
  globalThis.location = { href: "https://game.test/game.php?page=vesmir" };
  t.after(() => { if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation; });
  const container = warContainer();
  const saved = new Map();
  const storage = { get: async key => saved.get(key), set: async (key, value) => saved.set(key, value) };
  const requests = [];
  let currentName = "AAFM-1234-56";
  let submits = 0;
  let newAttack = false;
  let newAttackName = "";
  let failPost = false;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" })
    .format(Date.now() - 60000).split("/").join(". ");
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(Date.now() - 60000);
  const headers = row([cell("", "Název planety"), cell("", "Města"), cell("", "SDI"), cell("", "BS")]);
  const planet = row([cell(""), cell("AAFM-1234-56"), cell("20"), cell("0"), cell("500")],
    { textContent: "AAFM-1234-56", getAttribute: () => "game.php?page=planety&planeta=2" });
  const options = {
    storage, navigate: async () => assert.fail("rename must not navigate"),
    getDocument: async url => {
      requests.push(url);
      const params = new URL(url).searchParams;
      if (params.get("page") === "prehled") return {
        querySelector: () => ({ getAttribute: () => "game.php?page=vesmir&hledat=mayk" })
      };
      if (params.get("akce") === "armada") return {
        querySelector: () => null
      };
      if (params.get("s") === "sp") {
        const form = makeForm({
          planeta: { value: "2", options: [{ value: "2", textContent: currentName }] },
          novy: currentName, prejmenovat: "Přejmenovat"
        });
        form.getAttribute = () => "game.php?page=planety&s=sp";
        return { forms: [form] };
      }
      planet.querySelector = () => ({ textContent: currentName, getAttribute: () => "game.php?page=planety&planeta=2" });
      return { querySelector: () => ({ rows: [headers, planet] }) };
    },
    postDocument: async (url, body) => {
      requests.push(url);
      if (body.has("prejmenovat")) {
        submits++;
        assert.equal(saved.get("sgo-war-renames").at(-1).state, "pending", "journal is persisted before POST");
        assert.equal(body.get("planeta"), "2");
        assert.equal(body.get("prejmenovat"), "Přejmenovat");
        currentName = body.get("novy");
        if (failPost) throw new Error("Network response lost");
        return {};
      }
      assert.equal(body.get("text"), "mayk");
      assert.equal(body.get("utoky"), "0");
      return spyDoc({ date, filter: { utoky: "0" },
        entries: [...(newAttack ? [{ time: "23:59:59", text: `ZHN dopadly na planetu „${newAttackName}“` }] : []),
          { time }, { time, result: "nezjistil" }, { time, text: "neprobil obranu" },
          { time, text: "ZHN dopadly na planetu „AAFM-1234-56“" },
          { time, text: "ZHN dopadly na planetu „LOST-1234-56“" }] });
    }
  };
  const war = W.mount(container, options);
  assert.equal(requests.length, 0, "mount does not search automatically");
  await war.refresh();
  assert.equal(requests.length, 4);
  const attacks = container.querySelector("#sgo-war-attacks").children;
  assert.equal(attacks.length, 5);
  assert.equal(attacks[2].children[1].textContent, "Enemy");
  assert.equal(attacks[2].children[2].textContent, "neprobil obranu");
  assert.match(container.querySelector("#sgo-war-attack-summary").textContent, /5 útokov/);
  assert.equal(attacks[2].children[2].children.length, 2, "unnamed attack offers explicit planet selection");
  assert.equal(attacks[2].children[2].children[0].value, "");
  assert.equal(attacks[3].children[2].children[0].textContent, "Premenovať");
  assert.equal(attacks[4].children[2].children.length, 0, "lost planet is never guessed");
  const spyRows = container.querySelector("#sgo-war-spies").children;
  assert.equal(spyRows.length, 1, "two spy results on one planet produce one rename row");
  assert.match(container.querySelector("#sgo-war-spy-summary").textContent, /mayk · 2 špionáží/);
  const action = spyRows[0].children.at(-1);
  const name = action.children[0].textContent.replace("Nový názov: ", "");
  assert.match(name, /^[A-Z]{4}-\d{4}-\d{2}$/);
  const defenseRename = container.querySelector("#sgo-war-planets").children[0].children[5].children[1];
  assert.equal(defenseRename.className, "sgo-war-rename-button");
  await defenseRename.listeners.click();
  assert.equal(submits, 1);
  assert.equal(currentName, name);
  assert.equal(saved.get("sgo-war-snapshot").army, null, "renaming remains available without army");
  assert.match(saved.get("sgo-war-snapshot").armyError, /univerzálov/);
  const record = saved.get("sgo-war-renames")[0];
  assert.equal(record.state, "done");
  assert.equal(record.oldName, "AAFM-1234-56");
  assert.equal(record.newName, name);
  assert.equal(record.attackIds.length, 3, "all old attacks with the same planet are handled together");
  await attacks[3].children[2].children[0].listeners.click();
  assert.equal(submits, 1, "stale buttons cannot resubmit handled attacks");
  const otherPlayerDoc = {
    forms: [],
    querySelector: () => ({ getAttribute: () => "game.php?page=vesmir&hledat=Other" })
  };
  const otherPlayer = warContainer(otherPlayerDoc);
  const otherWar = W.mount(otherPlayer, { storage, getDocument: async () => assert.fail("must not fetch") });
  await otherWar.ready;
  assert.equal(otherPlayer.querySelector("#sgo-war-attacks").children.length, 0);
  assert.match(otherPlayer.querySelector("#sgo-war-status").textContent, /inému hráčovi/);
  const next = warContainer();
  const count = requests.length;
  const restored = W.mount(next, options);
  await restored.draftsReady;
  assert.equal(next.querySelector("#sgo-war-attacks").children.length, 5);
  assert.equal(next.querySelector("#sgo-war-spies").children.length, 1);
  assert.equal(requests.length, count, "navigation restores without requests");
  assert.match(next.querySelector("#sgo-war-attacks").children[3].children[2].children[0].textContent, /Premenované/);
  newAttack = true;
  newAttackName = currentName;
  await restored.refresh();
  const newAction = next.querySelector("#sgo-war-attacks").children[0].children[2].children[0];
  assert.equal(newAction.textContent, "Premenovať");
  failPost = true;
  await newAction.listeners.click();
  assert.equal(submits, 2);
  assert.match(next.querySelector("#sgo-war-status").textContent, /Výsledok je neistý/);
  assert.equal(saved.get("sgo-war-renames").at(-1).state, "pending");
  await newAction.listeners.click();
  assert.equal(submits, 2, "uncertain result is never resubmitted");
  await restored.refresh();
  assert.equal(saved.get("sgo-war-renames").at(-1).state, "done", "refresh reconciles lost response by current name");
  assert.match(next.querySelector("#sgo-war-attacks").children[0].children[2].children[0].textContent, /Premenované/);
  assert.match(next.querySelector("#sgo-war-planets").children[0].children[5].children[1].textContent, /Premenované/);
  failPost = false;
  const unnamed = next.querySelector("#sgo-war-attacks").children[3].children[2];
  assert.equal(unnamed.children[0].value, "");
  await unnamed.children[1].listeners.click();
  assert.equal(submits, 2, "no implicit target for unnamed attack");
  unnamed.children[0].value = "2";
  await unnamed.children[1].listeners.click();
  assert.equal(submits, 3);
  assert.equal(saved.get("sgo-war-renames").at(-1).attackIds.includes(saved.get("sgo-war-snapshot").attacks[3].id), true);
});

test("direct rename refuses stale ownership, wrong player, corrupt history and failed journal writes before POST", async t => {
  const oldLocation = globalThis.location;
  globalThis.location = { href: "https://game.test/game.php?page=vesmir" };
  t.after(() => { if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation; });
  for (const scenario of ["stale", "owner", "history", "write", "rejected", "verification"]) {
    const snapshot = {
      ownerName: "mayk", army: { own: 10000, race: 20000, deficit: 0, target: 10000 },
      planets: [{ id: "2", name: "AAFM-1234-56", cities: 20, maxCities: null, cityDeficit: null, sdi: 0, bs: 500 }],
      spies: [], attacks: [], lastUpdated: Date.now(), newSpyIds: []
    };
    const saved = new Map([["sgo-war-snapshot", snapshot]]);
    let posts = 0;
    let nativeReads = 0;
    const container = warContainer();
    const war = W.mount(container, {
      storage: {
        get: async key => saved.get(key),
        set: async (key, value) => {
          if (scenario === "write" && key === "sgo-war-renames") throw new Error("Write failed");
          saved.set(key, structuredClone(value));
        }
      },
      getDocument: async url => {
        if (new URL(url).searchParams.get("page") === "prehled") return {
          querySelector: () => ({ getAttribute: () => `game.php?hledat=${scenario === "owner" ? "Other" : "mayk"}` })
        };
        nativeReads++;
        if (scenario === "verification" && nativeReads === 2) throw new Error("Verification offline");
        const doc = renameDoc("FIRST-OLD", scenario === "stale" ? "CHANGED-NAME" : "AAFM-1234-56");
        doc.form.getAttribute = () => "game.php?page=planety&s=sp";
        return doc;
      },
      postDocument: async () => { posts++; return {}; }
    });
    await war.ready;
    const action = container.querySelector("#sgo-war-planets").children[0].children[5].children[1];
    if (scenario === "history") saved.set("sgo-war-renames", [{}]);
    await Promise.all([action.listeners.click(), action.listeners.click()]);
    assert.equal(container.querySelector("#sgo-war-status").dataset.state, "error", scenario);
    assert.equal(posts, ["rejected", "verification"].includes(scenario) ? 1 : 0, scenario);
    if (scenario === "rejected") assert.equal(saved.get("sgo-war-renames")[0].state, "failed");
    if (scenario === "verification") {
      assert.equal(saved.get("sgo-war-renames")[0].state, "pending");
      await action.listeners.click();
      assert.equal(posts, 1, "cannot retry unknown result");
    }
  }
});
