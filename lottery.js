(function (root) {
  "use strict";
  function validateDraw(draw) {
    if (!draw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draw.at) ||
        !Array.isArray(draw.numbers) || draw.numbers.length !== 6 ||
        draw.numbers.some(n => !Number.isSafeInteger(n) || n < 1) ||
        new Set(draw.numbers).size !== 6) throw new Error("Neplatný záznam žrebovania.");
    const [day, time] = draw.at.split("T");
    const date = new Date(`${day}T${time}:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== draw.at) throw new Error("Neplatný čas žrebovania.");
    return { at: draw.at, numbers: [...draw.numbers].sort((a, b) => a - b) };
  }
  function merge(...histories) {
    const result = new Map();
    for (const history of histories) {
      if (!Array.isArray(history)) throw new Error("Neplatná história žrebovaní.");
      for (const item of history) {
        const draw = validateDraw(item);
        const existing = result.get(draw.at);
        if (existing && JSON.stringify(existing.numbers) !== JSON.stringify(draw.numbers)) {
          throw new Error(`Rozdielne výsledky pre žrebovanie ${draw.at}. Automaticky ich neprepíšem.`);
        }
        result.set(draw.at, draw);
      }
    }
    return [...result.values()].sort((a, b) => a.at.localeCompare(b.at));
  }
  function readDraws(text) {
    const pattern = /(?:Předposlední|Poslední)\s+tažená\s+čísla:\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+v\s+(\d{1,2}):(\d{2})\s+((?:\d+\s*,\s*){5}\d+)(?!\s*,)/g;
    const draws = [...text.matchAll(pattern)].map(m => ({
      at: `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}`,
      numbers: m[6].split(",").map(n => Number(n.trim()))
    }));
    if (!draws.length) throw new Error("Výsledky žrebovaní nie sú čitateľné. História zostala zachovaná.");
    return merge(draws);
  }
  function gistId(value) {
    const id = value.trim().replace(/^https:\/\/gist\.github\.com\/[^/]+\//, "").replace(/\/$/, "");
    if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error("Zadaj platné Gist ID alebo odkaz.");
    return id;
  }
  async function request(url, token, method = "GET", data) {
    const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
    if (data) headers["Content-Type"] = "application/json";
    let response;
    if (typeof root.GM?.xmlHttpRequest === "function") {
      response = await new Promise((resolve, reject) => root.GM.xmlHttpRequest({
        url, method, headers, data: data ? JSON.stringify(data) : undefined, timeout: 20000,
        anonymous: true,
        onload: resolve,
        onerror: () => reject(new Error("Spojenie s GitHubom zlyhalo.")),
        ontimeout: () => reject(new Error("GitHub neodpovedal včas."))
      }));
      if (response.status < 200 || response.status >= 300) throw new Error(`GitHub HTTP ${response.status}. Over token, oprávnenie gist a jeho platnosť.`);
      return JSON.parse(response.responseText);
    }
    response = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : undefined, credentials: "omit", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}. Over token, oprávnenie gist a jeho platnosť.`);
    return response.json();
  }
  async function sync(config, local, send = request) {
    const id = gistId(config.id);
    if (!config.token?.trim()) throw new Error("Chýba GitHub token. História je uložená iba lokálne.");
    const url = `https://api.github.com/gists/${id}`;
    const decode = gist => {
      const file = gist.files?.["draws.json"];
      if (!file || file.truncated || typeof file.content !== "string") throw new Error("Gist neobsahuje úplný súbor draws.json.");
      const data = JSON.parse(file.content);
      if (data.schemaVersion !== 1) throw new Error("Nepodporovaný formát draws.json.");
      return merge(data.draws);
    };
    const remote = decode(await send(url, config.token));
    const combined = merge(remote, local);
    if (JSON.stringify(combined) !== JSON.stringify(remote)) {
      await send(url, config.token, "PATCH", { files: { "draws.json": { content: JSON.stringify({ schemaVersion: 1, draws: combined }, null, 2) } } });
      const verified = decode(await send(url, config.token));
      const union = merge(combined, verified);
      if (JSON.stringify(union) !== JSON.stringify(verified)) throw new Error("Súbežný zápis do Gistu. Lokálne dáta ostali zachované; zopakuj Aktualizovať.");
      return verified;
    }
    return combined;
  }
  const api = { validateDraw, merge, readDraws, gistId, sync };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOLottery = api;
})(globalThis);
