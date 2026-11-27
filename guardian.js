(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const L = typeof module !== "undefined" && module.exports ? require("./lottery.js") : root.SGOLottery;
  const routes = {
    bonus: "game.php?page=prehled&akce=denniBonus",
    casino: "game.php?page=obchod&s=6",
    nn: "game.php?page=posta&s=4",
    ranking: "game.php?page=vesmir&jak=hraci",
    vala: "game.php?page=vesmir&jak=98",
    runner: "game.php?page=vesmir&jak=98",
    odyssean: "game.php?page=vesmir&jak=102"
  };
  const nnDestination = "game.php?page=obchod&s=3";
  const BET_KEY = "sgo-casino-bet";
  const NN_WATCH_KEY = "sgo-nn-watch";
  const NN_HISTORY_KEY = "sgo-nn-history";
  const targets = { vala: "Vala Mal Doran", odyssean: "Odyssean" };
  function readRanking(doc) {
    const table = doc.querySelector("table.serazeniHracuAll");
    const rows = table && [...table.rows].filter(row => !row.querySelector("th")).slice(0, 3);
    if (!rows || rows.length !== 3) throw new Error("Nenašiel som kompletné TOP 3 hráčov.");
    const players = rows.map((row, index) => {
      const cells = [...row.cells].map(cell => C.clean(cell.textContent));
      const name = C.clean(row.cells[1]?.querySelector("a")?.textContent);
      const stats = cells.slice(3, 7).map(C.integer);
      const conquered = cells[7]?.match(/^(\d+)\s*[×x]$/);
      const conquestCount = conquered ? C.integer(conquered[1]) : null;
      if (cells[0] !== `${index + 1}.` || !name || !cells[2] || stats.length !== 4 ||
          stats.some(value => value === null || value < 0) || conquestCount === null) {
        throw new Error("Nečitateľné údaje TOP 3 hráčov.");
      }
      return { rank: index + 1, name, race: cells[2], planets: stats[0], population: stats[1],
        power: stats[2], area: stats[3], conquered: conquestCount };
    });
    if (new Set(players.map(player => player.name)).size !== 3) throw new Error("Nejednoznačné TOP 3 hráčov.");
    return { status: "ok", text: "TOP 3 načítané", rows: players };
  }
  function readTarget(doc, key) {
    const name = targets[key];
    const row = [...doc.querySelectorAll("tr")].find(candidate => C.clean(candidate.cells?.[1]?.querySelector("a")?.textContent) === name);
    if (!row) throw new Error(`${name} sa v zozname nenašla.`);
    const cells = [...row.cells].map(cell => C.clean(cell.textContent));
    const power = C.integer(cells[4]);
    if (power === null) throw new Error(`Nečitateľná vojenská sila: ${name}.`);
    const attacks = [...row.querySelectorAll("a[href]")].map(link => ({
      url: new URL(link.getAttribute("href"), "https://stargame-online.cz/www/"),
      title: C.clean(link.getAttribute("title") || link.querySelector("img")?.getAttribute("title")),
      icon: link.querySelector("img")?.getAttribute("class") || ""
    })).filter(link => link.url.searchParams.has("utok") && link.url.searchParams.get("cil") === name);
    const strength = power.toLocaleString("sk-SK");
    if (key === "vala") {
      const conquest = attacks.some(link => /^„?D“?(?:\s|-)|dob[ýy]v/i.test(link.title) || /\bdob[yv]/i.test(link.icon));
      return { status: conquest ? "action" : "ok", text: conquest ? `Vala UP · D (${strength})` : `Vala bez D (${strength})` };
    }
    return { status: attacks.length ? "action" : "ok",
      text: attacks.length ? `Odyss!!! UP · k dobytiu (${strength})` : `Nelze útočiť (${strength})` };
  }
  function readRunner(doc) {
    const found = [];
    for (const row of doc.querySelectorAll("tr")) {
      const name = C.clean(row.cells?.[1]?.querySelector("a")?.textContent);
      if (!name || name === targets.vala) continue;
      const planets = C.integer(C.clean(row.cells[2]?.textContent));
      if (planets === null || planets <= 1) continue;
      const power = C.integer(C.clean(row.cells[4]?.textContent));
      const conquest = [...row.querySelectorAll("a[href]")].some(link => {
        const url = new URL(link.getAttribute("href"), "https://stargame-online.cz/www/");
        if (!url.searchParams.has("utok") || url.searchParams.get("cil") !== name) return false;
        const title = C.clean(link.getAttribute("title") || link.querySelector("img")?.getAttribute("title"));
        const icon = link.querySelector("img")?.getAttribute("class") || "";
        return /^„?D“?(?:\s|-)|dob[ýy]v/i.test(title) || /\bdob[yv]/i.test(icon);
      });
      found.push({ name, planets, power, conquest });
    }
    if (!found.length) return { status: "ok", text: "Runner: nikto s >1 pl." };
    const open = found.filter(entry => entry.conquest);
    if (!open.length) return { status: "ok", text: `Runner bez D (${found.length})` };
    const first = open[0];
    return { status: "action", text: `Runner UP · D ${first.name} (${first.planets} pl.${open.length > 1 ? `, +${open.length - 1}` : ""})` };
  }
  function pageText(doc) {
    const body = doc.body.cloneNode(true);
    body.querySelectorAll("script,style,#sgo-addon").forEach(element => element.remove());
    // Detached documents have no innerText layout; keep boundaries between inline text nodes.
    const walker = doc.createTreeWalker(body, 4);
    const parts = [];
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim();
      if (text) parts.push(text);
    }
    return parts.join("\n");
  }
  function readBonus(text) {
    const clean = C.clean(text);
    if (!/Každý den máte 5 zatočení zdarma/.test(clean)) throw new Error("Nerozpoznaná stránka denného bonusu.");
    const attempts = clean.match(/(?:^|\s)(\d+)\s*x(?:\s|$)/);
    if (!attempts) return { status: "unknown", text: "Neznámy počet pokusov" };
    const count = Number(attempts[1]);
    return { status: count ? "action" : "ok", text: count ? `${count} pokusov · vybrať bonus` : "Dnešné pokusy využité" };
  }
  function readCasino(text, doc) {
    const clean = C.clean(text);
    if (!/Super\s*6/.test(clean)) throw new Error("Nerozpoznaná stránka Herne.");
    const count = clean.match(/Počet slosování\s*:\s*(\d+)/);
    if (/Již máme vsazeno/.test(clean) && count) {
      const remaining = Number(count[1]);
      return { status: remaining ? "ok" : "action", text: remaining ? `Vsadené · ${remaining} slosovaní` : "Treba vsadiť" };
    }
    if (/Již máme vsazeno/.test(clean)) return { status: "ok", text: "Vsadené · počet slosovaní neznámy" };
    const betForm = doc && [...doc.querySelectorAll('form input[type="submit"],form button[type="submit"],form button:not([type])')]
      .some(button => /^vsadit(?:\s|$)/i.test(C.clean(button.value || button.textContent)));
    if (betForm || /nemáte vsazeno|nemáme vsazeno/i.test(clean)) return { status: "action", text: "Treba vsadiť" };
    return { status: "unknown", text: "Neznámy stav stávky" };
  }
  function readNN(text) {
    const compact = C.clean(text);
    const pattern = /»\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g;
    const dates = [...compact.matchAll(pattern)];
    for (let i = 0; i < dates.length; i++) {
      const day = dates[i];
      const section = compact.slice(day.index + day[0].length, dates[i + 1]?.index);
      const match = section.match(/NN\s*-\s*další\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      if (match) {
        const date = new Date(`${day[3]}-${day[2].padStart(2, "0")}-${day[1].padStart(2, "0")}T12:00:00Z`);
        const posted = [...section.slice(0, match.index).matchAll(/\b(\d{2}:\d{2}):\d{2}\b/g)].pop();
        if (posted && match[1] < posted[1]) date.setUTCDate(date.getUTCDate() + 1);
        return {
          status: "unknown", text: `${day[1]}. ${day[2]}. ${day[3]} · NN ${match[1]}–${match[2]}`,
          date: date.toISOString().slice(0, 10), start: match[1], end: match[2]
        };
      }
    }
    return { status: "unknown", text: "Neznáme · chýba hlásenie NN" };
  }
  function isPlanetMarket(url) {
    try {
      const parsed = new URL(url, "https://stargame-online.cz");
      return ["/www/game.php", "/game.php"].includes(parsed.pathname) &&
        parsed.searchParams.get("page") === "obchod" &&
        parsed.searchParams.get("s") === "3";
    } catch { return false; }
  }
  function readMarketOffers(doc) {
    const table = doc.querySelector("#obchodPlanety");
    if (!table) {
      const text = C.clean(doc.querySelector(".contentStranky")?.textContent);
      if (/nikdo nenabízí planety ke koupi/i.test(text)) return [];
      throw new Error("Nenašiel som tabuľku ponúk planét. Sledovanie bolo zastavené.");
    }
    if (table.closest('[style*="display:none"],[style*="display: none"],[hidden]')) {
      throw new Error("Tabuľka ponúk je skrytá. Sledovanie bolo zastavené.");
    }
    const offers = [];
    for (const row of table.querySelectorAll("tr.obchdodPlanetyPlaneta")) {
      const cells = row.cells;
      if (!cells || cells.length < 3) throw new Error("Nečitateľná ponuka planéty.");
      const name = C.clean(cells[1].textContent);
      if (!/\(NN\)/i.test(name)) continue;
      const planet = name.match(/^([A-Z]{4}-\d+-\d{2})\s*\(NN\)/);
      const type = C.clean(cells[2].textContent);
      if (!planet || !type) throw new Error("Nečitateľný názov alebo typ NN planéty.");
      offers.push({ planet: planet[1], type });
    }
    if (new Set(offers.map(offer => offer.planet)).size !== offers.length) throw new Error("Duplicitná NN planéta v ponukách.");
    return offers.sort((a, b) => a.planet.localeCompare(b.planet));
  }
  function offerKey(offer) { return JSON.stringify([offer.planet, offer.type]); }
  function localNNState(history, now = Date.now()) {
    const latest = history.entries.filter(entry => !entry.falseAlarm && entry.at <= now)
      .sort((a, b) => b.at - a.at)[0];
    if (!latest && !history.window) return null;
    const start = history.window ? history.window.start : latest.at + history.min * 60000;
    const end = history.window ? history.window.end : latest.at + history.max * 60000;
    const format = time => new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(new Date(time));
    const today = gameDay(now);
    const startDay = gameDay(start);
    const nextDay = new Date(`${today}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const tomorrow = nextDay.toISOString().slice(0, 10);
    nextDay.setUTCDate(nextDay.getUTCDate() - 2);
    const yesterday = nextDay.toISOString().slice(0, 10);
    const dayLabel = startDay === today ? "" : startDay === tomorrow ? "zajtra " :
      startDay === yesterday ? "včera " : "iný deň ";
    const label = `${dayLabel}${format(start)}–${format(end)}${gameDay(end) !== startDay ? " (+1 deň)" : ""}`;
    return { status: now < start ? "ok" : now <= end ? "action" : "unknown",
      text: `${now < start ? "Čakáme" : now <= end ? "Okno" : "Okno uplynulo"} ${label}`,
      label, start, end, latest, manualWindow: Boolean(history.window) };
  }
  function readNNHistory(value) {
    if (value == null) return { min: 40, max: 60, entries: [] };
    if (!Number.isInteger(value.min) || !Number.isInteger(value.max) || value.min < 0 ||
        value.max < value.min || value.max > 1440 || !Array.isArray(value.entries) ||
        value.entries.some(entry => !entry || typeof entry.id !== "string" || !entry.id ||
          !Number.isFinite(entry.at) || !Number.isFinite(new Date(entry.at + value.max * 60000).getTime()) ||
          !["watch", "manual"].includes(entry.source) || typeof entry.falseAlarm !== "boolean") ||
        new Set(value.entries.map(entry => entry.id)).size !== value.entries.length ||
        (value.source != null && !["auto", "mail", "local"].includes(value.source)) ||
        (value.window != null && (!Number.isFinite(value.window.start) || !Number.isFinite(value.window.end) ||
          !Number.isFinite(new Date(value.window.start).getTime()) || !Number.isFinite(new Date(value.window.end).getTime()) ||
          value.window.start > value.window.end))) throw new Error("Uložená evidencia NN je poškodená.");
    return value;
  }
  function localInputTime(time) {
    const date = new Date(time);
    return new Date(time - date.getTimezoneOffset() * 60000).toISOString().slice(11, 16);
  }
  function timeOnDay(value, reference, offset = 0) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) return null;
    const day = new Date(reference);
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    const expectedDay = day.getDate();
    day.setHours(Number(match[1]), Number(match[2]), 0, 0);
    if (day.getDate() !== expectedDay || day.getHours() !== Number(match[1]) || day.getMinutes() !== Number(match[2])) return null;
    return day.getTime();
  }
  function manualNNWindow(startValue, endValue, now = Date.now(), offset = 0) {
    const start = timeOnDay(startValue, now, offset);
    if (start === null) return null;
    const end = timeOnDay(endValue, now, offset + (endValue < startValue ? 1 : 0));
    return end === null ? null : { start, end };
  }
  function nnWatchDelay(mode = "human", random = Math.random) {
    const [min, max] = mode === "confirm" ? [250, 650] : [3500, 9500];
    return min + Math.floor(random() * (max - min + 1));
  }
  function showNNAlert(doc, details = []) {
    doc.getElementById?.("sgo-nn-alert")?.remove();
    const overlay = doc.createElement("div");
    overlay.id = "sgo-nn-alert";
    overlay.className = "sgo-nn-alert-overlay";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-label", "Potvrdené nové NN v obchode");
    const box = doc.createElement("div");
    box.className = "sgo-nn-alert-box";
    const title = doc.createElement("strong");
    title.textContent = "MÁME NN!";
    const sub = doc.createElement("span");
    sub.textContent = details.length ? `Potvrdené 3× po sebe (${details.length} v ponuke)` : "Potvrdené 3× po sebe v obchode";
    const hint = doc.createElement("small");
    hint.textContent = "Klikni kamkoľvek pre zatvorenie";
    box.append(title, sub, hint);
    overlay.append(box);
    const dismiss = () => {
      overlay.remove();
      doc.removeEventListener?.("click", dismiss, true);
    };
    overlay.addEventListener("click", dismiss);
    setTimeout(() => doc.addEventListener?.("click", dismiss, true), 0);
    doc.body?.append(overlay);
    return overlay;
  }
  function gameDay(time) {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
  }
  function displayState(key, entry, now = Date.now()) {
    if (!entry?.status || !entry.time) return { status: "unknown", text: "Neznáme" };
    if (key === "nn" && entry.date && entry.start && entry.end) {
      const clock = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(now));
      const today = gameDay(now);
      const overnight = entry.start > entry.end;
      const tomorrow = new Date(`${entry.date}T12:00:00Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const endDay = overnight ? tomorrow.toISOString().slice(0, 10) : entry.date;
      if (today < entry.date || (today === entry.date && clock < entry.start)) {
        return { status: "ok", text: `Čakáme ${entry.start}–${entry.end}` };
      }
      if (today < endDay || (today === endDay && clock <= entry.end)) {
        return { status: "action", text: `Okno ${entry.start}–${entry.end}` };
      }
      return { status: "unknown", text: "Okno uplynulo" };
    }
    if (gameDay(entry.time) !== gameDay(now) || (key === "casino" && now - entry.time >= 6 * 3600000) || ((key === "vala" || key === "odyssean" || key === "runner") && now - entry.time >= 3600000)) {
      return { status: "unknown", text: "Staré údaje" };
    }
    return entry;
  }
  function mount(container, { getDocument, log, canEdit, storage, rankingContainer, syncHistory = L.sync,
      navigate = url => location.assign(url), revealGame = () => {}, delayFn = nnWatchDelay }) {
    container.innerHTML = `<div class="sgo-watch-heading"><strong>Prehľad</strong><button type="button" id="sgo-guardian-refresh">Aktualizovať</button></div>
      <div id="sgo-guardian-items"></div>
      <div id="sgo-casino-actions" class="sgo-casino-actions" hidden>
        <button type="button" id="sgo-casino-bet">Staviť</button>
        <label class="sgo-casino-random" title="Čisto náhodné čísla bez histórie"><input type="checkbox" id="sgo-casino-pure-random"> Čisto náhodne</label>
      </div>
      <div id="sgo-nn-actions" class="sgo-nn-actions">
        <button type="button" id="sgo-nn-start" title="Sledovať ponuky NN v obchode">Sledovať</button>
        <button type="button" id="sgo-nn-stop" disabled>Stop</button>
      </div>
      <p class="sgo-note" id="sgo-guardian-status" role="status">Iba ručná kontrola · bez herných akcií.</p>
      <details class="sgo-nn-settings"><summary>Evidencia NN</summary>
        <div class="sgo-nn-content">
          <section class="sgo-nn-card sgo-nn-overview" aria-label="Prehľad odhadov">
            <h4>Prehľad odhadov</h4>
            <p id="sgo-nn-mail"></p>
            <p id="sgo-nn-local"></p>
            <label class="sgo-nn-source">Na hlavnom riadku zobraziť
              <select id="sgo-nn-source">
                <option value="auto">Automaticky: vlastné, inak pošta</option>
                <option value="local">Vlastné zistenie alebo okno</option>
                <option value="mail">Hlásenie z pošty</option>
              </select>
            </label>
          </section>
          <section class="sgo-nn-card" aria-label="Interval odhadu">
            <h4>Interval odhadu</h4>
            <p class="sgo-nn-help">Čas po poslednom platnom NN. Odhad nie je potvrdenie dostupnosti.</p>
            <div class="sgo-nn-fields">
              <label>Od (min)<input id="sgo-nn-min" type="number" min="0" max="1440" step="1"></label>
              <label>Do (min)<input id="sgo-nn-max" type="number" min="0" max="1440" step="1"></label>
            </div>
            <div class="sgo-nn-buttons"><button type="button" id="sgo-nn-save-interval">Uložiť interval</button></div>
          </section>
          <section class="sgo-nn-card" aria-label="Vlastné okno">
            <h4>Vlastné okno</h4>
            <p class="sgo-nn-help">Má prednosť pred odhadom zo záznamov. Koniec pred začiatkom znamená nasledujúci deň.</p>
            <div class="sgo-nn-fields">
              <label>Od<input id="sgo-nn-window-start" type="time"></label>
              <label>Do<input id="sgo-nn-window-end" type="time"></label>
            </div>
            <label class="sgo-nn-day"><input id="sgo-nn-window-yesterday" type="checkbox"> Začiatok včera</label>
            <div class="sgo-nn-buttons">
              <button type="button" id="sgo-nn-save-window">Nastaviť okno</button>
              <button type="button" id="sgo-nn-clear-window">Zrušiť okno</button>
            </div>
          </section>
          <section class="sgo-nn-card" aria-label="Pridať NN">
            <h4>Pridať NN</h4>
            <div class="sgo-nn-fields sgo-nn-add-fields">
              <label>Čas NN<input id="sgo-nn-time" type="time"></label>
              <label class="sgo-nn-day"><input id="sgo-nn-yesterday" type="checkbox"> Včera</label>
            </div>
            <div class="sgo-nn-buttons"><button type="button" id="sgo-nn-add">Pridať vlastné NN</button></div>
          </section>
          <p class="sgo-nn-help">Zadávaš čas prehliadača; okno sa zobrazuje v čase hry (Praha). Nový záznam alebo okno platí dnes, prípadne včera podľa voľby.</p>
          <section class="sgo-nn-card" aria-label="História NN">
            <h4>História NN</h4>
            <div id="sgo-nn-history"></div>
          </section>
        </div>
      </details>
      <details class="sgo-watch-settings"><summary>História a Gist</summary>
        <p class="sgo-note" id="sgo-lottery-history"></p>
        <p class="sgo-note" id="sgo-lottery-stats"></p>
        <p class="sgo-note" id="sgo-lottery-sync" role="status">Synchronizácia zatiaľ neoverená.</p>
        <label class="sgo-planet">Gist ID alebo odkaz<input id="sgo-gist-id" type="text" autocomplete="off"></label>
        <label class="sgo-planet">GitHub token (gist)<input id="sgo-gist-token" type="password" autocomplete="off" spellcheck="false"></label>
        <button type="button" id="sgo-gist-save">Uložiť nastavenia</button>
        <p class="sgo-note">Prázdny token vypne synchronizáciu. Uloženie neposiela požiadavky.</p>
      </details>`;
    const $ = selector => container.querySelector(selector);
    const casinoActions = $("#sgo-casino-actions");
    const nnActions = $("#sgo-nn-actions");
    casinoActions?.addEventListener("click", e => e.stopPropagation());
    nnActions?.addEventListener("click", e => e.stopPropagation());
    let checking = false;
    let state = {};
    let history = [];
    let config = {};
    let nnHistory = { min: 40, max: 60, entries: [] };
    let nnSaving = false;
    let restored = false;
    let nnTimer = null;
    function readNNWatch() {
      if (typeof sessionStorage === "undefined") return null;
      try { return JSON.parse(sessionStorage.getItem(NN_WATCH_KEY) || "null"); } catch { return null; }
    }
    function writeNNWatch(watch) {
      if (typeof sessionStorage === "undefined") return;
      if (watch) sessionStorage.setItem(NN_WATCH_KEY, JSON.stringify(watch));
      else sessionStorage.removeItem(NN_WATCH_KEY);
    }
    function render() {
      $("#sgo-guardian-items").replaceChildren();
      for (const [key, title] of [["bonus", "Denný bonus"], ["casino", "Herňa"], ["nn", "NN"], ["vala", "Vala"], ["odyssean", "Odyssean"], ["runner", "Runner"]]) {
        const local = key === "nn" ? localNNState(nnHistory) : null;
        const useLocal = key === "nn" && (nnHistory.source === "local" || (nnHistory.source !== "mail" && local));
        const view = useLocal ? (local || { status: "unknown", text: "Chýba vlastné NN" }) : displayState(key, state[key]);
        const row = document.createElement("a");
        row.className = "sgo-watch-row"; row.href = key === "nn" ? nnDestination : routes[key]; row.dataset.status = view.status; row.dataset.key = key;
        const label = document.createElement("strong"); label.textContent = title;
        const detail = document.createElement("span"); detail.className = "sgo-watch-detail"; detail.textContent = `${key === "nn" ? (useLocal ? "Vlastné · " : "Pošta · ") : ""}${view.text}`;
        const stampTime = useLocal ? view.latest?.at : state[key]?.time;
        const stamp = stampTime ? new Date(stampTime).toLocaleString("sk-SK") : "Zatiaľ nekontrolované";
        const windowDates = view.start != null ? ` · ${new Date(view.start).toLocaleString("sk-SK", { timeZone: "Europe/Prague" })} – ${new Date(view.end).toLocaleString("sk-SK", { timeZone: "Europe/Prague" })} (čas hry)` : "";
        row.title = `${view.latest || view.manualWindow ? "Vlastný odhad · " : ""}${view.text}${windowDates} · ${stamp}${!view.latest && !view.manualWindow && state[key]?.error ? ` · ${state[key].error}` : ""}`;
        row.append(label, detail);
        if (key === "casino" && casinoActions) row.append(casinoActions);
        if (key === "nn" && nnActions) row.append(nnActions);
        $("#sgo-guardian-items").append(row);
      }
      const casinoView = displayState("casino", state.casino);
      $("#sgo-casino-actions").hidden = casinoView.status !== "action";
      $("#sgo-casino-pure-random").checked = Boolean(config.pureRandom);
      const nnView = displayState("nn", state.nn);
      const watch = readNNWatch();
      const watching = Boolean(watch?.active);
      $("#sgo-nn-actions").hidden = false;
      $("#sgo-nn-start").disabled = watching;
      $("#sgo-nn-stop").disabled = !watching;
      const local = localNNState(nnHistory);
      $("#sgo-nn-mail").textContent = `Pošta: ${displayState("nn", state.nn).text}${state.nn?.date ? ` · ${state.nn.date} ${state.nn.start}–${state.nn.end}` : ""}`;
      $("#sgo-nn-local").textContent = local ? `Vlastný odhad: ${local.text} · ${local.manualWindow ? "ručne nastavené okno" : `NN ${new Date(local.latest.at).toLocaleString("sk-SK")} (${local.latest.source === "watch" ? "sledovanie" : "ručne"})`}` : "Vlastný odhad: zatiaľ nemáš platné zistenie.";
      $("#sgo-nn-local").title = local ? `${new Date(local.start).toLocaleString("sk-SK", { timeZone: "Europe/Prague" })} – ${new Date(local.end).toLocaleString("sk-SK", { timeZone: "Europe/Prague" })} (čas hry)` : "";
      const nnList = $("#sgo-nn-history");
      nnList.replaceChildren();
      if (!nnHistory.entries.length) {
        const empty = document.createElement("p"); empty.className = "sgo-nn-help"; empty.textContent = "Zatiaľ nemáš žiadne záznamy.";
        nnList.append(empty);
      }
      for (const entry of [...nnHistory.entries].sort((a, b) => b.at - a.at)) {
        const item = document.createElement("div"); item.className = "sgo-nn-entry";
        const label = document.createElement("strong");
        label.textContent = `${entry.falseAlarm ? "Falošné" : "Platné"} · ${entry.source === "watch" ? "sledovanie" : "ručne"} · ${new Date(entry.at).toLocaleDateString("sk-SK")}`;
        const time = document.createElement("input"); time.type = "time";
        time.value = localInputTime(entry.at);
        time.setAttribute("aria-label", "Čas zaznamenaného NN");
        const save = document.createElement("button"); save.type = "button"; save.textContent = "Upraviť čas";
        save.addEventListener("click", () => updateNNEntry(entry.id, { at: parseNNTime(time.value, entry.at) }));
        const toggle = document.createElement("button"); toggle.type = "button";
        toggle.textContent = entry.falseAlarm ? "Obnoviť" : "Falošné NN";
        toggle.addEventListener("click", () => updateNNEntry(entry.id, { falseAlarm: !entry.falseAlarm }));
        const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Vymazať";
        remove.addEventListener("click", () => updateNNEntry(entry.id, null));
        item.append(label, time, save, toggle, remove);
        nnList.append(item);
      }
      $("#sgo-lottery-history").textContent = `Zachytené žrebovania: ${history.length}. Nemusí ísť o úplnú históriu.`;
      const stats = L.analyze(history);
      $("#sgo-lottery-stats").textContent = stats.totalDraws
        ? `Najčastejšie: ${stats.hot.map(item => `${item.number} (${item.count}×)`).join(", ")}`
        : "Štatistika čaká na prvé zachytené žrebovanie.";
      if (rankingContainer) {
        rankingContainer.replaceChildren();
        const heading = document.createElement("a");
        heading.className = "sgo-ranking-heading"; heading.href = routes.ranking;
        heading.textContent = "TOP 3 · celkovo →";
        rankingContainer.append(heading);
        const ranking = state.ranking;
        if (ranking?.status === "ok" && ranking.rows?.length === 3) {
          const columns = document.createElement("div"); columns.className = "sgo-ranking-columns";
          for (const [label, full] of [["Hráč / rasa", "Hráč / rasa"], ["Pl.", "Planéty"],
            ["Pop.", "Populácia"], ["Sila", "Sila"], ["Rozloha", "Rozloha"], ["D.", "Dobytia"]]) {
            const column = document.createElement("span"); column.textContent = label; column.title = full;
            columns.append(column);
          }
          rankingContainer.append(columns);
          for (const player of ranking.rows) {
            const row = document.createElement("a");
            row.className = "sgo-ranking-row"; row.href = routes.ranking;
            const title = document.createElement("div"); title.className = "sgo-ranking-player";
            const name = document.createElement("strong"); name.textContent = `${player.rank}. ${player.name}`;
            const race = document.createElement("span"); race.textContent = player.race;
            title.append(name, race);
            row.append(title);
            for (const [label, value] of [["Planéty", player.planets], ["Populácia", player.population],
              ["Sila", player.power], ["Rozloha", player.area], ["Dobytia", player.conquered]]) {
              const metric = document.createElement("span");
              metric.textContent = value.toLocaleString("sk-SK"); metric.title = `${label}: ${metric.textContent}`;
              row.append(metric);
            }
            row.title = `${player.rank}. ${player.name} · ${player.race}`;
            rankingContainer.append(row);
          }
        }
        const note = document.createElement("p"); note.className = "sgo-note";
        note.textContent = ranking?.status === "ok" ? `Stav z ${new Date(ranking.time).toLocaleString("sk-SK")}` :
          `Neznáme · ${ranking?.error || "použi Aktualizovať hore"}`;
        rankingContainer.append(note);
      }
    }
    async function restore() {
      try {
        state = await storage.get("sgo-guardian") || {};
        history = L.merge(await storage.get("sgo-lottery-history") || []);
        config = await storage.get("sgo-gist-config") || {};
        nnHistory = readNNHistory(await storage.get(NN_HISTORY_KEY));
        $("#sgo-nn-min").value = String(nnHistory.min);
        $("#sgo-nn-max").value = String(nnHistory.max);
        $("#sgo-nn-source").value = nnHistory.source || "auto";
        $("#sgo-nn-window-start").value = nnHistory.window ? localInputTime(nnHistory.window.start) : "";
        $("#sgo-nn-window-end").value = nnHistory.window ? localInputTime(nnHistory.window.end) : "";
        if (nnHistory.window) {
          const yesterday = new Date(); yesterday.setHours(12, 0, 0, 0); yesterday.setDate(yesterday.getDate() - 1);
          $("#sgo-nn-window-yesterday").checked = new Date(nnHistory.window.start).toDateString() === yesterday.toDateString();
        }
        $("#sgo-gist-id").value = config.id || "";
        $("#sgo-gist-token").value = config.token || "";
        $("#sgo-casino-pure-random").checked = Boolean(config.pureRandom);
        restored = true; render();
      } catch (error) {
        $("#sgo-guardian-status").textContent = `Chyba uložených kontrol: ${error.message}`;
        log(`Kontroly: ${error.message}`, "error");
      }
    }
    render();
    const ready = restore();
    function parseNNTime(value, reference = Date.now(), offset = 0) {
      const time = timeOnDay(value, reference, offset);
      return time !== null && time <= Date.now() ? time : null;
    }
    async function saveNNHistory(next, message) {
      if (nnSaving) throw new Error("Počkaj na uloženie evidencie NN.");
      nnSaving = true;
      try {
        readNNHistory(next);
        await storage.set(NN_HISTORY_KEY, next);
        nnHistory = next;
        render();
        $("#sgo-guardian-status").textContent = message;
        log(`NN: ${message}`);
      } finally { nnSaving = false; }
    }
    async function updateNNEntry(id, changes) {
      try {
        await ready;
        if (!restored) throw new Error("Evidenciu NN sa nepodarilo načítať.");
        if (changes && "at" in changes && changes.at === null) throw new Error("Zadaj platný čas NN, ktorý nie je v budúcnosti.");
        await saveNNHistory({ ...nnHistory, entries: changes
          ? nnHistory.entries.map(entry => entry.id === id ? { ...entry, ...changes } : entry)
          : nnHistory.entries.filter(entry => entry.id !== id) }, "Evidencia NN aktualizovaná.");
      } catch (error) {
        $("#sgo-guardian-status").textContent = `NN: ${error.message}`;
        log(`NN: ${error.message}`, "error");
      }
    }
    $("#sgo-nn-save-interval").addEventListener("click", async () => {
      try {
        await ready;
        if (!restored) throw new Error("Evidenciu NN sa nepodarilo načítať.");
        const min = C.integer($("#sgo-nn-min").value);
        const max = C.integer($("#sgo-nn-max").value);
        if (min === null || max === null || min < 0 || max < min || max > 1440) throw new Error("Zadaj interval od 0 do 1440 minút; začiatok nesmie byť po konci.");
        await saveNNHistory({ ...nnHistory, min, max }, "Interval odhadu NN uložený.");
      } catch (error) {
        $("#sgo-guardian-status").textContent = `NN: ${error.message}`;
        log(`NN: ${error.message}`, "error");
      }
    });
    $("#sgo-nn-source").addEventListener("change", async () => {
      try {
        await ready;
        if (!restored) throw new Error("Evidenciu NN sa nepodarilo načítať.");
        await saveNNHistory({ ...nnHistory, source: $("#sgo-nn-source").value }, "Zdroj riadka NN uložený.");
      } catch (error) {
        $("#sgo-nn-source").value = nnHistory.source || "auto";
        $("#sgo-guardian-status").textContent = `NN: ${error.message}`;
        log(`NN: ${error.message}`, "error");
      }
    });
    $("#sgo-nn-add").addEventListener("click", async () => {
      try {
        await ready;
        if (!restored) throw new Error("Evidenciu NN sa nepodarilo načítať.");
        const at = parseNNTime($("#sgo-nn-time").value, Date.now(), $("#sgo-nn-yesterday").checked ? -1 : 0);
        if (at === null) throw new Error("Zadaj platný čas NN, ktorý nie je v budúcnosti.");
        const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, at, source: "manual", falseAlarm: false };
        await saveNNHistory({ ...nnHistory, entries: [...nnHistory.entries, entry] }, "Vlastné NN uložené.");
        $("#sgo-nn-time").value = "";
        $("#sgo-nn-yesterday").checked = false;
      } catch (error) {
        $("#sgo-guardian-status").textContent = `NN: ${error.message}`;
        log(`NN: ${error.message}`, "error");
      }
    });
    $("#sgo-nn-save-window").addEventListener("click", async () => {
      try {
        await ready;
        if (!restored) throw new Error("Evidenciu NN sa nepodarilo načítať.");
        const startValue = $("#sgo-nn-window-start").value;
        const endValue = $("#sgo-nn-window-end").value;
        const window = manualNNWindow(startValue, endValue, Date.now(), $("#sgo-nn-window-yesterday").checked ? -1 : 0);
        if (!window) throw new Error("Zadaj platný začiatok a koniec vlastného okna.");
        await saveNNHistory({ ...nnHistory, window }, "Vlastné okno NN uložené; má prednosť pred odhadom zo záznamov.");
      } catch (error) {
        $("#sgo-guardian-status").textContent = `NN: ${error.message}`;
        log(`NN: ${error.message}`, "error");
      }
    });
    $("#sgo-nn-clear-window").addEventListener("click", async () => {
      try {
        await ready;
        if (!restored) throw new Error("Evidenciu NN sa nepodarilo načítať.");
        await saveNNHistory({ ...nnHistory, window: null }, "Vlastné okno zrušené; používa sa odhad zo záznamov.");
        $("#sgo-nn-window-start").value = "";
        $("#sgo-nn-window-end").value = "";
        $("#sgo-nn-window-yesterday").checked = false;
      } catch (error) {
        $("#sgo-guardian-status").textContent = `NN: ${error.message}`;
        log(`NN: ${error.message}`, "error");
      }
    });
    $("#sgo-gist-save").addEventListener("click", async () => {
      try {
        await ready;
        if (!restored || checking) throw new Error("Počkaj na dokončenie kontroly.");
        const token = $("#sgo-gist-token").value.trim();
        const id = $("#sgo-gist-id").value.trim();
        const next = { id: id ? L.gistId(id) : "", token, pureRandom: Boolean(config.pureRandom) };
        if (token && !next.id) throw new Error("K tokenu doplň Gist ID.");
        await storage.set("sgo-gist-config", next);
        config = next;
        $("#sgo-lottery-sync").textContent = "Nastavenia uložené. Použi Aktualizovať.";
      } catch (error) {
        $("#sgo-lottery-sync").textContent = error.message;
        log(`Gist: ${error.message}`, "error");
      }
    });
    $("#sgo-guardian-refresh").addEventListener("click", async () => {
      if (checking) return;
      checking = true; $("#sgo-guardian-refresh").disabled = true;
      const errors = [];
      try {
        await ready;
        if (!restored) throw new Error("Uložené údaje sa nepodarilo načítať.");
        if (!canEdit()) throw new Error("Najprv zastav útoky a počkaj na dokončenie operácie.");
        for (const [key, read] of [["bonus", readBonus], ["casino", readCasino], ["nn", readNN],
          ["ranking", (_text, doc) => readRanking(doc)], ["vala", (_text, doc) => readTarget(doc, "vala")],
          ["odyssean", (_text, doc) => readTarget(doc, "odyssean")], ["runner", (_text, doc) => readRunner(doc)]]) {
          if (!canEdit()) throw new Error("Prebieha iná operácia. Kontrola zastavená.");
          $("#sgo-guardian-status").textContent = `Kontrolujem ${{ bonus: "bonus", casino: "Herňu", nn: "NN", ranking: "TOP 3", vala: "Valu", odyssean: "Odysseana", runner: "Runnera" }[key]}…`;
          let doc;
          try { doc = await getDocument(new URL(routes[key], location.href).href); }
          catch (error) {
            state[key] = { status: "unknown", text: "Neznáme · načítanie zlyhalo", error: error.message, time: Date.now() };
            render(); await storage.set("sgo-guardian", state);
            throw error;
          }
          const text = pageText(doc);
          try {
            state[key] = { ...read(text, doc), time: Date.now() };
            log(`Kontroly: ${state[key].text}`);
          } catch (error) {
            state[key] = { status: "unknown", text: "Neznáme · chyba čítania", error: error.message, time: Date.now() };
            errors.push(error.message); log(`Kontroly: ${error.message}`, "error");
          }
          if (key === "casino") {
            try {
              history = L.merge(history, L.readDraws(text));
              await storage.set("sgo-lottery-history", history);
            } catch (error) {
              errors.push(error.message);
              log(`História: ${error.message}`, "error");
            }
          }
          render();
          await storage.set("sgo-guardian", state);
        }
        if (config.id && config.token) {
          $("#sgo-lottery-sync").textContent = "Synchronizujem…";
          try {
            history = await syncHistory(config, history);
            await storage.set("sgo-lottery-history", history);
            render();
            $("#sgo-lottery-sync").textContent = `Synchronizované ${new Date().toLocaleString("sk-SK")}`;
          } catch (error) {
            $("#sgo-lottery-sync").textContent = `Nesynchronizované: ${error.message}`;
            errors.push(error.message); log(`Gist: ${error.message}`, "error");
          }
        } else $("#sgo-lottery-sync").textContent = "Iba lokálna história · nastav Gist ID a token.";
        $("#sgo-guardian-status").textContent = errors.length ? `Časť kontroly zlyhala: ${errors.join(" ")}` : "Aktualizované · ďalšia kontrola iba po kliknutí.";
      } catch (error) {
        $("#sgo-guardian-status").textContent = `Kontrola zastavená: ${error.message}`;
        log(`Kontroly: ${error.message}`, "error");
      } finally { checking = false; $("#sgo-guardian-refresh").disabled = false; }
    });
    $("#sgo-casino-pure-random").addEventListener("change", async () => {
      try {
        await ready;
        config = { ...config, pureRandom: Boolean($("#sgo-casino-pure-random").checked) };
        await storage.set("sgo-gist-config", config);
      } catch (error) {
        log(`Herňa: ${error.message}`, "error");
      }
    });
    function applyCasinoBet(bet) {
      const selected = L.fillBetForm(document, bet.numbers);
      const modeLabel = bet.pureRandom ? "čisto náhodne" : `podľa histórie (${bet.draws || 0} ťahov)`;
      $("#sgo-guardian-status").textContent = `Predvyplnené čísla (${modeLabel}): ${selected.join(", ")}. Skontroluj a odošli Vsadit.`;
      log(`Herňa: vybrané čísla (${modeLabel}): ${selected.join(", ")}. Formulár nebol odoslaný.`);
      revealGame();
    }
    async function resumeCasinoBet() {
      if (!L.isCasino?.(location.href) || typeof sessionStorage === "undefined") return;
      try {
        const raw = sessionStorage.getItem(BET_KEY);
        if (!raw) return;
        sessionStorage.removeItem(BET_KEY);
        await ready;
        applyCasinoBet(JSON.parse(raw));
      } catch (error) {
        $("#sgo-guardian-status").textContent = `Herňa: ${error.message}`;
        log(`Herňa: ${error.message}`, "error");
      }
    }
    $("#sgo-casino-bet").addEventListener("click", async e => {
      e?.stopPropagation?.();
      e?.preventDefault?.();
      try {
        await ready;
        if (!canEdit()) throw new Error("Najprv zastav útoky a počkaj na dokončenie operácie.");
        const pureRandom = Boolean($("#sgo-casino-pure-random").checked);
        const numbers = L.pickNumbers(history, { pureRandom });
        const bet = { numbers, pureRandom, draws: history.length };
        if (L.isCasino?.(location.href) && document.querySelector("#cisla")) {
          applyCasinoBet(bet);
          return;
        }
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(BET_KEY, JSON.stringify(bet));
        log(`Herňa: otváram Super 6 na predvyplnenie čísel (${numbers.join(", ")}).`);
        await navigate(new URL(routes.casino, location.href).href);
      } catch (error) {
        $("#sgo-guardian-status").textContent = `Herňa: ${error.message}`;
        log(`Herňa: ${error.message}`, "error");
      }
    });
    function stopNNWatch(message = "Sledovanie NN zastavené.") {
      clearTimeout(nnTimer);
      nnTimer = null;
      writeNNWatch(null);
      render();
      $("#sgo-guardian-status").textContent = message;
      log(`NN: ${message}`);
    }
    async function stepNNWatch(watch) {
      clearTimeout(nnTimer);
      nnTimer = null;
      const current = readMarketOffers(document);
      if (!Array.isArray(watch.baseline) || watch.baseline.some(item => !item || typeof item.planet !== "string" || typeof item.type !== "string")) {
        watch.baseline = current;
        watch.confirmations = 0;
        watch.candidates = [];
        writeNNWatch(watch);
      }
      const baselineSet = new Set(watch.baseline.map(offerKey));
      const added = current.filter(item => !baselineSet.has(offerKey(item)));
      if (added.length > 0) {
        const addedKeys = new Set(added.map(offerKey));
        const common = (watch.candidates || []).filter(item => addedKeys.has(offerKey(item)));
        if (watch.confirmations > 0 && common.length) {
          watch.candidates = common;
          watch.confirmations++;
        } else {
          if (watch.confirmations > 0) log("NN: pôvodná ponuka alebo jej typ sa zmenili; overujem nové ponuky od začiatku.", "warn");
          watch.candidates = added;
          watch.confirmations = 1;
          watch.detectedAt = Date.now();
        }
        const details = watch.candidates.map(item => `${item.planet} (${item.type})`);
        if (watch.confirmations >= 3) {
          const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, at: watch.detectedAt, source: "watch", falseAlarm: false };
          await saveNNHistory({ ...nnHistory, entries: [...nnHistory.entries, entry] }, "Zistené NN uložené do evidencie.");
          writeNNWatch(null);
          render();
          showNNAlert(document, details);
          $("#sgo-guardian-status").textContent = `POTVRDENÉ NOVÉ NN (${details.length})! Klikni kamkoľvek pre zatvorenie upozornenia.`;
          log(`NN: POTVRDENÉ 3× po sebe! Nové ponuky v obchode: ${details.join(", ")}.`, "success");
          return;
        }
        writeNNWatch(watch);
        const fastDelay = delayFn("confirm");
        $("#sgo-guardian-status").textContent = `Zachytené nové NN (${watch.confirmations}/3) · okamžité overenie…`;
        log(`NN: zachytená nová ponuka (${watch.confirmations}/3): ${details.join(", ")}. Okamžitý kontrolný refresh.`);
        nnTimer = setTimeout(() => {
          navigate(new URL(nnDestination, location.href).href);
        }, fastDelay);
        return;
      }
      if (watch.confirmations > 0) {
        log("NN: predchádzajúca ponuka zmizla (falošný poplach). Pokračujem v sledovaní.", "warn");
        watch.confirmations = 0;
        watch.candidates = [];
      }
      watch.baseline = current;
      writeNNWatch(watch);
      const waitMs = delayFn("human");
      const sec = (waitMs / 1000).toFixed(1);
      $("#sgo-guardian-status").textContent = `Sledujem NN (základ: ${current.length}) · ďalší refresh o ${sec} s…`;
      nnTimer = setTimeout(() => {
        navigate(new URL(nnDestination, location.href).href);
      }, waitMs);
    }
    async function resumeNNWatch() {
      try {
        const watch = readNNWatch();
        if (!watch?.active) return;
        await ready;
        if (!restored) throw new Error("Evidenciu NN sa nepodarilo načítať.");
        render();
        if (!isPlanetMarket(location.href)) {
          $("#sgo-guardian-status").textContent = "Sledovanie NN aktívne · presmerúvam do obchodu s planétami…";
          await navigate(new URL(nnDestination, location.href).href);
          return;
        }
        await stepNNWatch(watch);
      } catch (error) {
        stopNNWatch(`Sledovanie zastavené: ${error.message}`);
        log(`NN: ${error.message}`, "error");
      }
    }
    $("#sgo-nn-start").addEventListener("click", async e => {
      e?.stopPropagation?.();
      e?.preventDefault?.();
      try {
        await ready;
        if (!restored) throw new Error("Evidenciu NN sa nepodarilo načítať.");
        if (!canEdit()) throw new Error("Najprv zastav útoky a počkaj na dokončenie operácie.");
        const watch = { active: true, baseline: isPlanetMarket(location.href) ? readMarketOffers(document) : null, confirmations: 0 };
        writeNNWatch(watch);
        render();
        if (!isPlanetMarket(location.href)) {
          log("NN: spúšťam sledovanie a otváram Obchod > Planéty.");
          await navigate(new URL(nnDestination, location.href).href);
          return;
        }
        log(`NN: sledovanie spustené (počiatočné ponuky: ${watch.baseline.length}).`);
        await stepNNWatch(watch);
      } catch (error) {
        writeNNWatch(null);
        render();
        $("#sgo-guardian-status").textContent = `NN: ${error.message}`;
        log(`NN: ${error.message}`, "error");
      }
    });
    $("#sgo-nn-stop").addEventListener("click", e => {
      e?.stopPropagation?.();
      e?.preventDefault?.();
      stopNNWatch();
    });
    return { render, resumeCasinoBet, resumeNNWatch };
  }
  const api = {
    pageText, readBonus, readCasino, readNN, readRanking, readTarget, readRunner,
    isPlanetMarket, readMarketOffers, localNNState, readNNHistory, timeOnDay, manualNNWindow, nnWatchDelay, showNNAlert, displayState, mount
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOGuardian = api;
})(globalThis);
