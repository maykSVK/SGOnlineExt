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
    ...entries.map(({ time = "09:10:00", name = "AAFM-1234-56", result = "zjistil", defender = "mayk" }) => ({
      cells: [time, "Enemy", `${defender} (Terrané)`, `${result} informace na planetě „${name}“`].map(value => cell(value))
    }))
  ];
  return {
    forms: [form],
    querySelectorAll: selector => selector === "table tr" ? rows
      : selector === "table" ? [{ querySelectorAll: () => [cell("Obránce")] }]
        : selector === "a[href]" && next ? [{ textContent: "Další »", getAttribute: () => next }] : []
  };
}

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
    novy: input
  });
  form.get("novy").focus = () => {};
  form.scrollIntoView = () => {};
  return { forms: [form], form };
}
const renameDraft = { planetId: "2", oldName: "AAFM-1234-56", newName: "ZZZZ-9876-54" };

test("rename selects the correct owned planet and prefills a unique proposal without submitting", () => {
  const doc = renameDoc();
  W.applyRenameDraft(doc, renameDraft);
  assert.equal(doc.form.get("planeta").value, "2");
  assert.equal(doc.form.get("novy").value, "ZZZZ-9876-54");
});

test("rename refuses changed ownership/name, collisions, invalid names and user drafts before altering any inputs", () => {
  for (const [doc, draft, message] of [
    [renameDoc("FIRST-OLD", "CHANGED-NAME"), renameDraft, /pôvodný názov/],
    [renameDoc(), { ...renameDraft, planetId: "missing" }, /pôvodný názov/],
    [renameDoc(), { ...renameDraft, newName: "Not a pattern" }, /neplatný/],
    [renameDoc("ZZZZ-9876-54"), renameDraft, /používa/],
    [renameDoc("FIRST-OLD", "AAFM-1234-56", "USER DRAFT"), renameDraft, /rozpracovaný/]
  ]) {
    assert.throws(() => W.applyRenameDraft(doc, draft), message);
    assert.equal(doc.form.get("planeta").value, "1");
  }
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
    storage, navigate: async url => { destination = url; },
    getDocument: async url => {
      requests++;
      const params = new URL(url).searchParams;
      if (params.get("page") === "prehled") return {
        querySelector: () => ({ getAttribute: () => "game.php?page=vesmir&hledat=mayk" })
      };
      if (params.get("akce") === "armada") return {
        querySelector: () => ({ closest: () => ({ textContent: "Je v RA20 000Máme10 000Z RADo RA" }) })
      };
      return { querySelector: () => ({ rows: [headers, planet] }) };
    },
    postDocument: async () => spyDoc()
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
  const initialRequests = requests;
  input("sdi").value = "250";
  input("bs").value = "600";
  await save();
  assert.equal(requests, initialRequests, "saving recalculates without network refresh");
  assert.equal(summary.textContent, "1 planét · 1 pod cieľom");
  assert.deepEqual(saved.get("sgo-war-defense-settings"), { sdi: 250, bs: 600 });
  const defenseRow = container.querySelector("#sgo-war-planets").children[0];
  assert.equal(defenseRow.children[4].textContent, "SDI 50 · BS 100");
  await defenseRow.children[5].children[0].listeners.click();
  assert.match(destination, /page=planety$/);
  assert.deepEqual(
    { sdi: saved.get("sgo-war-planet-draft").sdi, bs: saved.get("sgo-war-planet-draft").bs },
    { sdi: 50, bs: 100 }
  );
  const reloaded = warContainer();
  const next = W.mount(reloaded, options);
  await next.refresh();
  assert.equal(reloaded.querySelector("#sgo-war-sdi-target").value, "250");
  assert.equal(reloaded.querySelector("#sgo-war-bs-target").value, "600");
  assert.equal(reloaded.querySelector("#sgo-war-defense-summary").textContent, "1 planét · 1 pod cieľom");

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

test("war refresh auto-detects owner, renders grouped rename actions and hands off a one-shot tab-local draft", async t => {
  const oldLocation = globalThis.location;
  globalThis.location = { href: "https://game.test/game.php?page=vesmir" };
  t.after(() => { if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation; });
  const container = warContainer();
  const saved = new Map();
  const drafts = new Map();
  const session = {
    getItem: key => drafts.get(key) || null,
    setItem: (key, value) => drafts.set(key, value),
    removeItem: key => drafts.delete(key)
  };
  const storage = { get: async key => saved.get(key), set: async (key, value) => saved.set(key, value) };
  const requests = [];
  let destination;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" })
    .format(Date.now() - 60000).split("/").join(". ");
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(Date.now() - 60000);
  const headers = row([cell("", "Název planety"), cell("", "Města"), cell("", "SDI"), cell("", "BS")]);
  const planet = row([cell(""), cell("AAFM-1234-56"), cell("20"), cell("500"), cell("500")],
    { textContent: "AAFM-1234-56", getAttribute: () => "game.php?page=planety&planeta=2" });
  const war = W.mount(container, {
    session, storage, navigate: async url => { destination = url; },
    getDocument: async url => {
      requests.push(url);
      const params = new URL(url).searchParams;
      if (params.get("page") === "prehled") return {
        querySelector: () => ({ getAttribute: () => "game.php?page=vesmir&hledat=mayk" })
      };
      if (params.get("akce") === "armada") return {
        querySelector: () => ({ closest: () => ({ textContent: "Je v RA20 000Máme10 000Z RADo RA" }) })
      };
      return { querySelector: () => ({ rows: [headers, planet] }) };
    },
    postDocument: async (url, body) => {
      requests.push(url);
      assert.equal(body.get("text"), "mayk");
      assert.equal(body.get("utoky"), "7");
      return spyDoc({ date, entries: [{ time }, { time, result: "nezjistil" }] });
    }
  });
  assert.equal(requests.length, 0, "mount does not search automatically");
  await war.refresh();
  assert.equal(requests.length, 4);
  const spyRows = container.querySelector("#sgo-war-spies").children;
  assert.equal(spyRows.length, 1, "two spy results on one planet produce one rename row");
  assert.match(container.querySelector("#sgo-war-spy-summary").textContent, /mayk · 2 špionáží/);
  const action = spyRows[0].children.at(-1);
  const name = action.children[0].textContent.replace("Nový názov: ", "");
  assert.match(name, /^[A-Z]{4}-\d{4}-\d{2}$/);
  await action.children[1].listeners.click();
  assert.match(destination, /page=planety&s=sp$/);
  assert.equal(drafts.size, 1);
  assert.equal(saved.has("sgo-war-rename-draft"), false, "rename draft is not shared with other tabs");
  const nativeDoc = renameDoc();
  const next = warContainer(nativeDoc);
  globalThis.location.href = destination;
  W.mount(next, { session, storage, getDocument: async () => { throw new Error("must not fetch"); } });
  await Promise.resolve();
  assert.equal(nativeDoc.form.get("planeta").value, "2");
  assert.equal(nativeDoc.form.get("novy").value, name);
  assert.equal(drafts.size, 0, "draft is consumed on arrival, not replayed after refresh");
});
