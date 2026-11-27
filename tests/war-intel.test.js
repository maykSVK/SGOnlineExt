const { test } = require("node:test");
const assert = require("node:assert/strict");
const I = require("../war-intel.js");

function spyDoc({ target = "Jared", count = "24", available = "10 000", action = "game.php?page=jednotky&utok=7&cil=Jared", options = ["Planet"] } = {}) {
  const field = { name: "pocet_druzic", closest: () => ({ textContent: `Sonda ${available} ks`, querySelector: () => ({ textContent: "Sonda" }) }) };
  const submit = { name: "zautocit", value: "Zaútočit", type: "submit" };
  const fields = [field, { name: "cas", type: "hidden", value: "fresh-token" }, submit];
  fields.namedItem = name => fields.find(item => item.name === name);
  const form = {
    method: "post", elements: fields, getAttribute: () => action,
    querySelector: () => submit,
    querySelectorAll: selector => selector.startsWith("input") ? [field] : options.map(value => ({ value, textContent: value }))
  };
  const link = { getAttribute: () => action, querySelector: () => ({ textContent: count }),
    childNodes: [{ nodeType: 3, textContent: "Špionážní 24" }] };
  return {
    URL: "https://game.test/game.php",
    body: { cloneNode: () => ({ querySelectorAll: () => [], textContent: "" }) },
    querySelectorAll: selector => selector === "a.lowopacity" ? [link] : [],
    querySelector: selector => selector === "#formular" ? form : selector === "#nepritele" ? { textContent: target } : null
  };
}
function resultDoc({ victory = true, planet = "Planet", target = "Jared", sent = 1400, losses = 140, label = "Univerzál", value = "0" } = {}) {
  const unit = { textContent: "Sonda", querySelector: s => ({ textContent: s === ".g" ? String(sent) : String(losses) }) };
  const row = { querySelector: s => ({ textContent: s === "strong" ? label : value }) };
  const box = { textContent: planet, querySelector: () => ({ textContent: victory ? "Vítězství!" : "Porážka!" }) };
  return { querySelector: selector => ({
    "#datapl h2": { textContent: victory ? "Vítězství!" : "Porážka!" },
    "#datapl": box, "#obranj > .n": { textContent: target }, "#obranj tr": row
  })[selector] || null, querySelectorAll: selector => selector === "#nasej tr" ? [unit] : [] };
}
const request = { owner: "mayk", target: "Jared", planet: "Planet", field: "uni", time: 1000 };
const address = "https://game.test/game.php?page=jednotky&utok=7&cil=Jared";

test("spy choices use the user's exact discovery counts", () => {
  assert.deepEqual(I.FIELDS.map(field => field[2]), [100, 300, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800]);
});

test("spy form validates target, planet, inventory, limit and destination before posting", () => {
  const payload = I.spyForm(spyDoc(), address, "Jared", "Planet", "uni");
  assert.equal(payload.body.get("pocet_druzic"), "1400");
  assert.equal(payload.body.get("planeta2"), "Planet");
  assert.equal(payload.body.get("cas"), "fresh-token");
  assert.equal(payload.body.get("zautocit"), "Zaútočit");
  assert.throws(() => I.spyForm(spyDoc({ available: "500" }), address, "Jared", "Planet", "uni"), /Chýbajú sondy/);
  assert.throws(() => I.spyForm(spyDoc({ count: "0" }), address, "Jared", "Planet", "uni"), /limit/);
  assert.throws(() => I.spyForm(spyDoc(), address, "Jared", "Other", "uni"), /Planéta/);
  assert.throws(() => I.spyForm(spyDoc({ target: "Other" }), address, "Jared", "Planet", "uni"), /dostupná/);
  assert.throws(() => I.spyForm(spyDoc({ action: "https://other.test/game.php?page=jednotky&utok=7&cil=Jared" }), address, "Jared", "Planet", "uni"), /adresa/);
  assert.throws(() => I.spyForm(spyDoc(), address, "Jared", "Planet", "unknown"), /informáciu/);
});

test("spy results distinguish zero from failure and check target, planet and losses", () => {
  assert.deepEqual(I.readResult(resultDoc(), request), { ...request, outcome: "success", label: "Univerzál", value: "0", losses: 140 });
  assert.equal(I.readResult(resultDoc({ victory: false }), request).outcome, "failure");
  assert.throws(() => I.readResult(resultDoc({ planet: "Other" }), request), /hráča a planétu/);
  assert.throws(() => I.readResult(resultDoc({ target: "Other" }), request), /hráča a planétu/);
  assert.throws(() => I.readResult(resultDoc({ sent: 1300 }), request), /sond/);
  assert.throws(() => I.readResult(resultDoc({ losses: 1401 }), request), /sond/);
  assert.throws(() => I.readResult(resultDoc({ value: "???" }), request), /hodnotu/);
});

test("journal rejects malformed and unknown data rather than enabling a retry", () => {
  assert.deepEqual(I.readState(null), { pending: null, reports: [] });
  assert.throws(() => I.readState({ pending: {}, reports: [] }), /neplatné/);
  assert.throws(() => I.readState({ pending: { ...request, field: "bad" }, reports: [] }), /neplatné/);
  assert.throws(() => I.readState({ pending: null, reports: [{ ...request, outcome: "success" }] }), /neplatné/);
});

function archivedSpy({ owner = "mayk", target = "Jared", sent = 1400, outcome = "Zjistili jsme informace", value = "0" } = {}) {
  const cells = values => ({ querySelectorAll: () => values.map(textContent => ({ textContent })) });
  const rows = [cells([]), cells(["Družice", "Univerzál"]), cells([]), cells([String(sent), "Zjištěno"]), cells(["140", value])];
  const link = { getAttribute: name => name === "data-utocnik" ? owner : `?page=vesmir&hledat=${target}` };
  const summary = { textContent: `Špionažní útok ${outcome} na planetě „Planet“` };
  return {
    querySelector: selector => selector === ".recon-report-target a[href]" ? link : selector === ".summary" ? summary :
      selector === ".recon-report-meta" ? { textContent: "#123 » 16:00:01, 26.11.2026" } : null,
    querySelectorAll: () => rows
  };
}
test("imports only verified outgoing spy findings from the report page", () => {
  const entries = [
    archivedSpy(), archivedSpy({ outcome: "Nepřítel odrazil náš útok" }),
    archivedSpy({ owner: "other" }), archivedSpy({ target: "Other" }),
    archivedSpy({ value: "???" }), archivedSpy({ sent: 9999 })
  ];
  const reports = I.readSpyReports({ querySelectorAll: () => entries }, "mayk", "Jared");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].field, "uni");
  assert.equal(reports[0].planet, "Planet");
  assert.equal(reports[0].value, "0");
  assert.equal(reports[0].reportId, "123");
});

class Element {
  constructor(doc) { this.ownerDocument = doc; this.children = []; this.listeners = {}; this.value = ""; this.classList = { toggle() {} }; }
  append(...children) { this.children.push(...children); if (!this.value && children[0]?.value) this.value = children[0].value; }
  replaceChildren(...children) { this.children = []; this.value = ""; this.append(...children); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
}
function fixture(t, saved = new Map(), owner = "mayk") {
  const old = globalThis.location;
  globalThis.location = { href: "https://game.test/game.php" };
  t.after(() => { if (old === undefined) delete globalThis.location; else globalThis.location = old; });
  const doc = { createElement: () => new Element(doc) };
  const container = new Element(doc);
  const elements = new Map();
  container.querySelector = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element(doc));
    return elements.get(selector);
  };
  const state = { saved, posts: 0, mode: "success", owner };
  const unit = {
    textContent: "Stíhač - univerzál · Máme: 50 ks",
    querySelector: selector => selector === ".n" ? { textContent: "Stíhač - univerzál" } : null
  };
  const api = I.mount(container, {
    storage: { get: async key => state.saved.get(key), set: async (key, value) => {
      if (state.failPending && value.pending) throw new Error("Cannot save pending");
      if (state.failDone && key === I.KEY && !value.pending && value.reports.length) throw new Error("Cannot save result");
      state.saved.set(key, structuredClone(value));
    } },
    getDocument: async url => {
      const params = new URL(url).searchParams;
      if (params.get("page") === "prehled") {
        if (state.failOwner) throw new Error("Offline");
        return { querySelector: () => ({ getAttribute: () => `?page=vesmir&hledat=${state.owner}` }) };
      }
      if (params.get("akce") === "rozvedka") return { querySelectorAll: () => [] };
      if (params.get("akce") === "jednotky") return { querySelectorAll: () => [unit] };
      if (state.unavailable) return {
        body: { cloneNode: () => ({ querySelectorAll: () => [], textContent: "" }) },
        querySelectorAll: () => [], querySelector: () => null
      };
      return spyDoc();
    },
    postDocument: async (url, body) => {
      state.posts++;
      assert.equal(state.saved.get(I.KEY).pending.field, "uni");
      assert.equal(body.get("pocet_druzic"), "1400");
      if (state.mode === "lost") throw new Error("Offline");
      const doc = resultDoc();
      doc.URL = "https://game.test/game.php";
      doc.body = { cloneNode: () => ({ querySelectorAll: () => [], textContent: "" }) };
      return doc;
    },
    log() {}, canEdit: () => true, navigate: async url => { state.destination = url; }, revealGame() {}
  });
  const get = name => container.querySelector(`#sgo-intel-${name}`);
  get("attack-type").value = "1";
  return { api, state, get };
}

test("successful spy saves journal and displays a verified zero", async t => {
  const { api, state, get } = fixture(t);
  await api.initialized;
  get("target").value = "Jared";
  await api.load();
  get("field").value = "uni";
  await api.send();
  assert.equal(state.posts, 1);
  assert.equal(state.saved.get(I.KEY).pending, null);
  assert.equal(state.saved.get(I.KEY).reports[0].value, "0");
  assert.match(get("status").textContent, /Univerzál: 0/);
});

test("lost response persists a pending journal and prevents another POST", async t => {
  const { api, state, get } = fixture(t);
  await api.initialized;
  get("target").value = "Jared";
  await api.load();
  get("field").value = "uni";
  state.mode = "lost";
  await api.send();
  assert.equal(state.saved.get(I.KEY).pending.target, "Jared");
  assert.match(get("status").textContent, /neistý/);
  await api.send();
  assert.equal(state.posts, 1);
});

test("journal must persist before POST and failed result writes remain pending", async t => {
  const { api, state, get } = fixture(t);
  await api.initialized;
  get("target").value = "Jared";
  await api.load();
  get("field").value = "uni";
  state.failPending = true;
  await api.send();
  assert.equal(state.posts, 0);
  assert.match(get("status").textContent, /Cannot save pending/);
  state.failPending = false;
  state.failDone = true;
  await api.send();
  assert.equal(state.posts, 1);
  assert.equal(state.saved.get(I.KEY).pending.field, "uni");
  assert.match(get("status").textContent, /neistý/);
  await api.send();
  assert.equal(state.posts, 1);
});

test("attack preparation opens the chosen native form without sending an attack", async t => {
  const { api, state, get } = fixture(t);
  await api.initialized;
  get("target").value = "Jared";
  await api.load();
  get("attack-type").value = "2";
  await get("open-attack").listeners.click();
  const destination = new URL(state.destination);
  assert.equal(destination.searchParams.get("cil"), "Jared");
  assert.equal(destination.searchParams.get("utok"), "2");
  assert.equal(state.posts, 0);
});

test("reopening restores the player, selected options, findings, units and reports without an attack", async t => {
  const first = fixture(t);
  await first.api.initialized;
  first.get("target").value = "Jared";
  await first.api.load();
  first.get("field").value = "uni";
  first.get("field").listeners.change();
  first.get("attack-type").value = "2";
  first.get("attack-type").listeners.change();
  await first.api.flush();
  await first.api.send();
  const second = fixture(t, first.state.saved);
  await second.api.initialized;
  assert.equal(second.get("target").value, "Jared");
  assert.equal(second.get("planet").value, "Planet");
  assert.equal(second.get("field").value, "uni");
  assert.equal(second.get("attack-type").value, "2");
  assert.match(second.get("findings").children[0].children[0].textContent, /Univerzál: 0/);
  assert.match(second.get("units").children[0].textContent, /Stíhač/);
  assert.match(second.get("status").textContent, /Uložený prehľad.*neaktuálne/);
  assert.equal(second.state.posts, 0);
  second.state.owner = "other";
  await second.api.send();
  assert.equal(second.state.posts, 0);
  assert.match(second.get("status").textContent, /Prihlásený hráč sa zmenil/);
});

test("saved target is not restored for another account and failed verification allows a manual retry", async t => {
  const first = fixture(t);
  await first.api.initialized;
  first.get("target").value = "Jared";
  await first.api.load();
  const other = fixture(t, first.state.saved, "other");
  await other.api.initialized;
  assert.equal(other.get("target").value, "");
  assert.match(other.get("status").textContent, /inému účtu/);
  const offline = fixture(t, first.state.saved);
  offline.state.failOwner = true;
  await offline.api.initialized;
  assert.match(offline.get("status").textContent, /Offline/);
  offline.state.failOwner = false;
  offline.get("target").value = "Jared";
  await offline.api.load();
  assert.match(offline.get("status").textContent, /Jared/);
});

test("a failed refresh preserves the last saved snapshot and invalid snapshots are rejected", async t => {
  const first = fixture(t);
  await first.api.initialized;
  first.get("target").value = "Jared";
  await first.api.load();
  const saved = structuredClone(first.state.saved.get(I.SNAPSHOT_KEY));
  first.state.failOwner = true;
  await first.api.load();
  assert.deepEqual(first.state.saved.get(I.SNAPSHOT_KEY), saved);
  assert.equal(first.get("target").value, "Jared");
  assert.equal(first.get("planet").value, "Planet");
  assert.throws(() => I.readSnapshot({ ...saved, planet: "unknown" }), /neplatný/);
  assert.throws(() => I.readSnapshot({ ...saved, recent: [{}] }), /neplatný/);
});

test("saved reports and their original timestamps are displayed after reopening", async t => {
  const first = fixture(t);
  await first.api.initialized;
  first.get("target").value = "Jared";
  await first.api.load();
  const snapshot = first.state.saved.get(I.SNAPSHOT_KEY);
  snapshot.recent = [{ meta: "#123", direction: "Jared", result: "Výsledok", rows: ["Riadok"] }];
  snapshot.planetsTime = snapshot.time - 86400000;
  first.state.saved.set(I.SNAPSHOT_KEY, snapshot);
  const second = fixture(t, first.state.saved);
  await second.api.initialized;
  assert.match(second.get("reports").children[0].children[0].textContent, /#123.*Jared/);
  assert.match(second.get("reports").children[0].children[1].textContent, /Výsledok/);
  assert.match(second.get("status").textContent, /Zoznam planét je z/);
});

test("refresh without a spy form keeps the previous planet list and its original age", async t => {
  const first = fixture(t);
  await first.api.initialized;
  first.get("target").value = "Jared";
  await first.api.load();
  const oldTime = first.state.saved.get(I.SNAPSHOT_KEY).planetsTime;
  first.state.unavailable = true;
  await first.api.load();
  assert.equal(first.get("planet").value, "Planet");
  assert.equal(first.state.saved.get(I.SNAPSHOT_KEY).planetsTime, oldTime);
  assert.match(first.get("status").textContent, /Zoznam planét je zo staršieho načítania/);
});
