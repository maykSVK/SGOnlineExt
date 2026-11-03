const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createStorage } = require("../storage.js");

test("Tampermonkey storage persists settings across instances and takes priority", async () => {
  const values = new Map();
  const env = {
    GM: {
      getValue: async (key, fallback) => values.get(key) ?? fallback,
      setValue: async (key, value) => { values.set(key, value); }
    },
    chrome: { storage: { local: { get() { throw new Error("Wrong backend"); } } } }
  };
  const storage = createStorage(env);
  assert.equal(await storage.get("settings"), null);
  const value = { plans: { 3: { selected: true } }, feature: "population" };
  await storage.set("settings", value);
  assert.deepEqual(await createStorage(env).get("settings"), value);
});

test("extension storage and preview fallback preserve their existing data format", async () => {
  const values = {};
  const extension = createStorage({ chrome: { storage: { local: {
    get: async key => ({ [key]: values[key] }),
    set: async data => Object.assign(values, data)
  } } } });
  await extension.set("settings", { plans: {} });
  assert.deepEqual(await extension.get("settings"), { plans: {} });
  const items = new Map();
  const preview = createStorage({ sessionStorage: {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value)
  } });
  assert.equal(await preview.get("settings"), null);
  await preview.set("settings", { feature: "sectors" });
  assert.equal(items.get("settings"), '{"feature":"sectors"}');
  assert.deepEqual(await preview.get("settings"), { feature: "sectors" });
});

test("storage errors propagate rather than silently switching backend", async () => {
  const storage = createStorage({ GM: {
    getValue: async () => { throw new Error("Read failed"); },
    setValue: async () => { throw new Error("Write failed"); }
  } });
  await assert.rejects(storage.get("settings"), /Read failed/);
  await assert.rejects(storage.set("settings", {}), /Write failed/);
});
