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
function fixture(t) {
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
  const state = { saved: new Map(), posts: 0, mode: "success" };
  const unit = {
    textContent: "Stíhač - univerzál · Máme: 50 ks",
    querySelector: selector => selector === ".n" ? { textContent: "Stíhač - univerzál" } : null
  };
  const api = I.mount(container, {
    storage: { get: async key => state.saved.get(key), set: async (key, value) => {
      if (state.failPending && value.pending) throw new Error("Cannot save pending");
      if (state.failDone && !value.pending && value.reports.length) throw new Error("Cannot save result");
      state.saved.set(key, structuredClone(value));
    } },
    getDocument: async url => {
      const params = new URL(url).searchParams;
      if (params.get("page") === "prehled") return { querySelector: () => ({ getAttribute: () => "?page=vesmir&hledat=mayk" }) };
      if (params.get("akce") === "rozvedka") return { querySelectorAll: () => [] };
      if (params.get("akce") === "jednotky") return { querySelectorAll: () => [unit] };
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
