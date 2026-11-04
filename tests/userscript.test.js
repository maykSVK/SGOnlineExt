const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "stargame-pomocnik.user.js"), "utf8").replace(/\r\n/g, "\n");

test("self-contained userscript loads all modules and exact panel CSS", () => {
  let styles;
  const context = vm.createContext({
    document: { getElementById: () => null, readyState: "complete" },
    location: { pathname: "/not-a-game-page" },
    GM_addStyle: css => { styles = css; }
  });
  vm.runInContext(source, context);
  for (const name of ["SGOStorage", "SGO", "SGOPopulation", "SGOSectors", "SGOGuardian"]) {
    assert.ok(context[name], `${name} is bundled`);
  }
  assert.equal(styles, fs.readFileSync(path.join(root, "panel.css"), "utf8").replace(/\r\n/g, "\n").trimEnd());
  assert.ok(!source.includes("// @require"));
});

test("update metadata matches install script and package version", () => {
  const metadata = fs.readFileSync(path.join(root, "stargame-pomocnik.meta.js"), "utf8").replace(/\r\n/g, "\n");
  assert.ok(source.startsWith(metadata));
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  assert.ok(metadata.includes(`// @version      ${version}\n`));
  assert.match(metadata, /@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/maykSVK\/SGOnlineExt\/main\/stargame-pomocnik\.user\.js/);
});

test("userscript does not mount a second panel when another copy is active", () => {
  vm.runInNewContext(source, {
    document: { getElementById: () => ({}) },
    GM_addStyle: () => { throw new Error("Duplicate bootstrap"); }
  });
});
