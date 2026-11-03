(function (root) {
  "use strict";
  function createStorage(env) {
    if (typeof env.GM?.getValue === "function" && typeof env.GM?.setValue === "function") {
      return {
        get: key => env.GM.getValue(key, null),
        set: (key, value) => env.GM.setValue(key, value)
      };
    }
    if (env.chrome?.storage?.local) {
      return {
        get: async key => (await env.chrome.storage.local.get(key))[key],
        set: (key, value) => env.chrome.storage.local.set({ [key]: value })
      };
    }
    return {
      get: async key => JSON.parse(env.sessionStorage.getItem(key) || "null"),
      set: async (key, value) => env.sessionStorage.setItem(key, JSON.stringify(value))
    };
  }
  const api = { createStorage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOStorage = api;
})(globalThis);
