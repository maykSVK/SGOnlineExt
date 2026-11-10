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
    const pattern = /(?:Předposlední|Poslední)\s+tažená\s+čísla\s*:\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+v\s+(\d{1,2}):(\d{2})\s+((?:\d+\s*,\s*){5}\d+)(?!\d|\s*,)/gi;
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
  function analyze(draws = []) {
    const items = merge(draws);
    const counts = Array(26).fill(0);
    const lastSeen = Array(26).fill(-1);
    items.forEach((draw, index) => {
      for (const n of draw.numbers) {
        if (n >= 1 && n <= 25) {
          counts[n]++;
          lastSeen[n] = index;
        }
      }
    });
    const numbers = [];
    for (let n = 1; n <= 25; n++) {
      const gap = lastSeen[n] === -1 ? items.length : items.length - 1 - lastSeen[n];
      numbers.push({ number: n, count: counts[n], gap, weight: counts[n] + 1 + gap * 0.15 });
    }
    const ranked = [...numbers].sort((a, b) => b.count - a.count || b.gap - a.gap || a.number - b.number);
    return { totalDraws: items.length, numbers, hot: ranked.slice(0, 6), cold: ranked.slice(-6).reverse() };
  }
  function pickNumbers(draws = [], { pureRandom = false, random = Math.random } = {}) {
    const stats = analyze(draws);
    const pool = stats.numbers.map(item => ({
      number: item.number,
      weight: pureRandom || !stats.totalDraws ? 1 : item.weight
    }));
    const picked = [];
    while (picked.length < 6) {
      const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
      let roll = random() * totalWeight;
      let index = pool.findIndex(item => (roll -= item.weight) < 0);
      if (index < 0) index = pool.length - 1;
      picked.push(pool.splice(index, 1)[0].number);
    }
    return picked.sort((a, b) => a - b);
  }
  function isCasino(url) {
    try {
      const parsed = new URL(url, "https://stargame-online.cz");
      return ["/www/game.php", "/game.php"].includes(parsed.pathname) &&
        parsed.searchParams.get("page") === "obchod" &&
        parsed.searchParams.get("s") === "6";
    } catch { return false; }
  }
  function fillBetForm(doc, numbers) {
    if (!Array.isArray(numbers) || numbers.length !== 6 ||
        numbers.some(n => !Number.isSafeInteger(n) || n < 1 || n > 25) ||
        new Set(numbers).size !== 6) {
      throw new Error("Neplatná kombinácia 6 čísel (1–25) pre stávku.");
    }
    const input = doc.querySelector("#cisla");
    if (!input) throw new Error("Formulár na stávku Super 6 nie je na stránke dostupný.");
    for (let n = 1; n <= 25; n++) {
      const cell = doc.querySelector(`#vsaz-${n}`);
      if (cell) cell.className = "";
    }
    for (let i = 1; i <= 6; i++) {
      const slot = doc.querySelector(`#los-${i}`);
      if (slot) slot.textContent = "";
    }
    input.value = "";
    const sorted = [...numbers].sort((a, b) => a - b);
    sorted.forEach((n, index) => {
      const cell = doc.querySelector(`#vsaz-${n}`);
      if (cell) cell.className = "cislo-vsazeno";
      const slot = doc.querySelector(`#los-${index + 1}`);
      if (slot) slot.textContent = String(n);
      input.value += `${n < 10 ? "0" : ""}${n}.`;
    });
    const drawsInput = doc.querySelector("#pocet-slos");
    if (drawsInput && !drawsInput.value) drawsInput.value = "12";
    const cost = doc.querySelector("#naq-del");
    const count = Number(drawsInput?.value || 12);
    if (cost && Number.isFinite(count) && count >= 1 && count <= 12) cost.textContent = String(count * 1500000);
    return sorted;
  }
  const api = { validateDraw, merge, readDraws, gistId, sync, analyze, pickNumbers, isCasino, fillBetForm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOLottery = api;
})(globalThis);
