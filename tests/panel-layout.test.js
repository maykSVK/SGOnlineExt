const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../content.js"), "utf8");
const layout = source.slice(source.indexOf("  const touchLayout ="), source.indexOf("  let population;"));
const collapse = source.slice(source.indexOf('  $("#sgo-collapse").addEventListener("click"'), source.indexOf('  for (const tab of ["attacks", "activity"])'));

function mount(data, mobile) {
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, {
      hidden: false, attributes: {}, listeners: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name]; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      focus() {}
    });
    return elements.get(key);
  };
  const classes = new Set();
  const root = element("root");
  root.dataset = {};
  root.classList = { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } };
  root.style = { setProperty() {} };
  const media = { matches: mobile, addEventListener() {} };
  let saved;
  const context = vm.createContext({
    data: structuredClone(data), root, launcher: element("launcher"), $: element,
    matchMedia: () => media, innerWidth: mobile ? 390 : 1200, innerHeight: 800,
    window: { addEventListener() {} }, guardian: { render() {} },
    persist() { saved = structuredClone(context.data); }
  });
  vm.runInContext(layout + collapse, context);
  return {
    element, classes, media, root, context,
    saved: () => saved,
    click: () => element("#sgo-collapse").listeners.click(),
    resize(mobile) { media.matches = mobile; vm.runInContext("updateLayout()", context); }
  };
}

test("desktop collapse and reopen survive a new page without changing mobile preference", () => {
  const first = mount({}, false);
  assert.equal(first.element(".sgo-body").hidden, false);
  assert.equal(first.saved(), undefined, "restoring layout does not write settings");
  first.click();
  assert.equal(first.element(".sgo-body").hidden, true);
  assert.equal(first.element("#sgo-collapse").attributes["aria-expanded"], "false");
  const next = mount(first.saved(), false);
  assert.equal(next.element(".sgo-body").hidden, true);
  assert.equal(next.element("#sgo-collapse").textContent, "+");
  next.resize(true);
  assert.equal(next.element(".sgo-body").hidden, false);
  assert.equal(next.classes.has("sgo-mobile-open"), false);
  next.resize(false);
  assert.equal(next.element(".sgo-body").hidden, true, "resize does not forget desktop collapse");
  next.click();
  assert.equal(mount(next.saved(), false).element(".sgo-body").hidden, false);
});

test("mobile open, close, Escape and native-form reveal persist across pages", () => {
  const first = mount({}, true);
  assert.equal(first.classes.has("sgo-mobile-open"), false, "mobile still defaults to closed");
  first.element("launcher").listeners.click();
  const next = mount(first.saved(), true);
  assert.equal(next.classes.has("sgo-mobile-open"), true);
  assert.equal(next.element("launcher").attributes["aria-expanded"], "true");
  next.click();
  assert.equal(mount(next.saved(), true).classes.has("sgo-mobile-open"), false);
  next.element("launcher").listeners.click();
  next.root.listeners.keydown({ key: "Escape" });
  assert.equal(mount(next.saved(), true).classes.has("sgo-mobile-open"), false);
  next.element("launcher").listeners.click();
  vm.runInContext("revealGame()", next.context);
  assert.equal(mount(next.saved(), true).classes.has("sgo-mobile-open"), false);
});
