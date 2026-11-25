const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../rename.js");
const W = require("../war.js");

function documentFor(names, action = "game.php?page=planety&s=sp") {
  const fields = [
    { name: "planeta", options: names.map(([value, textContent]) => ({ value, textContent })) },
    { name: "novy", value: "" },
    { name: "prejmenovat", value: "Přejmenovat" },
    { name: "csrf", type: "hidden", value: "token" }
  ];
  fields.namedItem = name => fields.find(field => field.name === name);
  return { forms: [{ elements: fields, getAttribute: () => action }] };
}
class Element {
  constructor(doc) {
    this.ownerDocument = doc;
    this.children = [];
    this.listeners = {};
    this.value = "";
    this.classList = { toggle() {} };
  }
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
}
function fixture(t) {
  const oldLocation = globalThis.location;
  const oldCrypto = globalThis.crypto;
  globalThis.location = { href: "https://game.test/www/game.php?page=vesmir" };
  if (!globalThis.crypto) globalThis.crypto = require("node:crypto").webcrypto;
  t.after(() => {
    if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation;
    if (oldCrypto === undefined) delete globalThis.crypto; else globalThis.crypto = oldCrypto;
  });
  const doc = {};
  doc.createElement = () => new Element(doc);
  const container = new Element(doc);
  const elements = new Map();
  container.querySelector = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element(doc));
    return elements.get(selector);
  };
  const state = {
    names: [["1", "Alpha Centauri"], ["2", "Beta planeta"]],
    posts: 0, mode: "success", saved: new Map(), logs: [], sync: 0
  };
  const options = {
    getDocument: async url => new URL(url).searchParams.get("page") === "prehled"
      ? { querySelector: () => ({ getAttribute: () => "game.php?page=vesmir&hledat=mayk" }) }
      : documentFor(state.names, state.action),
    postDocument: async (url, body) => {
      state.posts++;
      assert.equal(body.get("csrf"), "token");
      if (state.mode === "success" || state.mode === "lost") {
        state.names = state.names.map(([id, name]) => [id, id === body.get("planeta") ? body.get("novy") : name]);
      }
      if (state.mode === "lost") throw new Error("Offline");
    },
    storage: { get: async key => state.saved.get(key), set: async (key, value) => {
      if (state.failDone && value.some?.(item => item.state === "done")) throw new Error("Storage error");
      state.saved.set(key, structuredClone(value));
    } },
    log: message => state.logs.push(message), canEdit: () => !state.blocked,
    onRenamed: async () => { state.sync++; }
  };
  const rename = R.mount(container, options);
  return { state, rename, get: selector => container.querySelector(`#sgo-rename-${selector}`) };
}

test("reads and filters planets using any case-insensitive substring", () => {
  const planets = R.readPlanets(documentFor([["", "Vyber"], ["1", "  Alfa   Planéta "], ["2", "Beta"]]));
  assert.deepEqual(planets, [{ id: "1", name: "Alfa Planéta" }, { id: "2", name: "Beta" }]);
  assert.deepEqual(R.filterPlanets(planets, "PLANÉ"), [planets[0]]);
  assert.deepEqual(R.filterPlanets(planets, "zzz"), []);
  assert.throws(() => R.readPlanets(documentFor([["1", "A"], ["1", "B"]])), /nečitateľný/);
  assert.throws(() => R.readPlanets({ forms: [] }), /formulár/);
});

test("live filtering and successful rename update list and shared journal", async t => {
  const { state, rename, get } = fixture(t);
  await rename.refresh();
  assert.equal(get("list").children.length, 2);
  get("search").value = "CENT";
  get("search").listeners.input();
  assert.equal(get("list").children.length, 1);
  assert.equal(get("list").children[0].children[0].children[0].textContent, "Alpha Centauri");
  await get("list").children[0].children[1].listeners.click();
  assert.equal(state.posts, 1);
  const record = state.saved.get(W.RENAMES_KEY)[0];
  assert.equal(record.state, "done");
  assert.equal(record.oldName, "Alpha Centauri");
  assert.match(record.newName, /^[A-Z]{4}-\d{4}-\d{2}$/);
  assert.equal(get("list").children.length, 1);
  assert.match(get("list").children[0].textContent, /Žiadna/);
  get("search").value = record.newName.slice(2, 6);
  get("search").listeners.input();
  assert.equal(get("list").children[0].children[0].children[0].textContent, record.newName);
  assert.equal(state.sync, 2);
});

test("lost response blocks retry until refresh reconciles the shared pending record", async t => {
  const { state, rename, get } = fixture(t);
  await rename.refresh();
  state.mode = "lost";
  await get("list").children[0].children[1].listeners.click();
  assert.equal(state.saved.get(W.RENAMES_KEY)[0].state, "pending");
  assert.equal(get("list").children[0].children[1].disabled, true);
  assert.match(get("status").textContent, /neistý/);
  await get("list").children[0].children[1].listeners.click();
  assert.equal(state.posts, 1);
  await rename.refresh();
  assert.equal(state.saved.get(W.RENAMES_KEY)[0].state, "done");
  assert.equal(get("list").children[0].children[1].disabled, false);
});

test("rejected rename and failed journal write do not allow unsafe retry", async t => {
  const { state, rename, get } = fixture(t);
  await rename.refresh();
  state.mode = "rejected";
  await get("list").children[0].children[1].listeners.click();
  assert.equal(state.saved.get(W.RENAMES_KEY)[0].state, "failed");
  assert.match(get("status").textContent, /nepotvrdila/);
  state.mode = "success";
  state.failDone = true;
  await get("list").children[0].children[1].listeners.click();
  assert.equal(state.saved.get(W.RENAMES_KEY)[1].state, "pending");
  assert.equal(get("list").children[0].children[1].disabled, true);
  assert.match(get("status").textContent, /neistý/);
});

test("stale names and unexpected form destinations are rejected before POST", async t => {
  const { state, rename, get } = fixture(t);
  await rename.refresh();
  state.names[0][1] = "Zmenená";
  await get("list").children[0].children[1].listeners.click();
  assert.equal(state.posts, 0);
  assert.match(get("status").textContent, /pôvodný názov/);
  state.names[0][1] = "Alpha Centauri";
  state.action = "https://elsewhere.test/game.php?page=planety&s=sp";
  await get("list").children[0].children[1].listeners.click();
  assert.equal(state.posts, 0);
  assert.match(get("status").textContent, /adresa formulára/);
});
