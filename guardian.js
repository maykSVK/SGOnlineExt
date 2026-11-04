(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const L = typeof module !== "undefined" && module.exports ? require("./lottery.js") : root.SGOLottery;
  const routes = {
    bonus: "game.php?page=prehled&akce=denniBonus",
    casino: "game.php?page=obchod&s=6",
    nn: "game.php?page=posta&s=4",
    ranking: "game.php?page=vesmir&jak=hraci"
  };
  const nnDestination = "game.php?page=obchod&s=3";
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
        return { status: "ok", text: `NN čakáme ${entry.start}–${entry.end}` };
      }
      if (today < endDay || (today === endDay && clock <= entry.end)) {
        return { status: "action", text: `Over NN · okno ${entry.start}–${entry.end}` };
      }
      return { status: "unknown", text: "Okno NN uplynulo · over poštu" };
    }
    if (gameDay(entry.time) !== gameDay(now) || (key === "casino" && now - entry.time >= 6 * 3600000)) {
      return { status: "unknown", text: "Neznáme · údaje sú staré" };
    }
    return entry;
  }
  function mount(container, { getDocument, log, canEdit, storage, rankingContainer, syncHistory = L.sync }) {
    container.innerHTML = `<div class="sgo-watch-heading"><strong>Denné kontroly</strong><button type="button" id="sgo-guardian-refresh">Aktualizovať</button></div>
      <div id="sgo-guardian-items"></div>
      <p class="sgo-note" id="sgo-guardian-status" role="status">Iba ručná kontrola · bez herných akcií.</p>
      <details class="sgo-watch-settings"><summary>História a Gist</summary>
        <p class="sgo-note" id="sgo-lottery-history"></p>
        <p class="sgo-note" id="sgo-lottery-sync" role="status">Synchronizácia zatiaľ neoverená.</p>
        <label class="sgo-planet">Gist ID alebo odkaz<input id="sgo-gist-id" type="text" autocomplete="off"></label>
        <label class="sgo-planet">GitHub token (gist)<input id="sgo-gist-token" type="password" autocomplete="off" spellcheck="false"></label>
        <button type="button" id="sgo-gist-save">Uložiť nastavenia</button>
        <p class="sgo-note">Prázdny token vypne synchronizáciu. Uloženie neposiela požiadavky.</p>
      </details>`;
    const $ = selector => container.querySelector(selector);
    let checking = false;
    let state = {};
    let history = [];
    let config = {};
    let restored = false;
    function render() {
      $("#sgo-guardian-items").replaceChildren();
      for (const [key, title] of [["bonus", "Denný bonus"], ["casino", "Herňa"], ["nn", "NN"]]) {
        const view = displayState(key, state[key]);
        const row = document.createElement("a");
        row.className = "sgo-watch-row"; row.href = key === "nn" ? nnDestination : routes[key]; row.dataset.status = view.status;
        const label = document.createElement("strong"); label.textContent = title;
        const detail = document.createElement("span"); detail.textContent = view.text;
        const stamp = state[key]?.time ? new Date(state[key].time).toLocaleString("sk-SK") : "Zatiaľ nekontrolované";
        row.title = `${view.text} · ${stamp}${state[key]?.error ? ` · ${state[key].error}` : ""}`;
        row.append(label, detail); $("#sgo-guardian-items").append(row);
      }
      $("#sgo-lottery-history").textContent = `Zachytené žrebovania: ${history.length}. Nemusí ísť o úplnú históriu.`;
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
        $("#sgo-gist-id").value = config.id || "";
        $("#sgo-gist-token").value = config.token || "";
        restored = true; render();
      } catch (error) {
        $("#sgo-guardian-status").textContent = `Chyba uložených kontrol: ${error.message}`;
        log(`Kontroly: ${error.message}`, "error");
      }
    }
    render();
    const ready = restore();
    $("#sgo-gist-save").addEventListener("click", async () => {
      try {
        await ready;
        if (!restored || checking) throw new Error("Počkaj na dokončenie kontroly.");
        const token = $("#sgo-gist-token").value.trim();
        const id = $("#sgo-gist-id").value.trim();
        const next = { id: id ? L.gistId(id) : "", token };
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
          ["ranking", (_text, doc) => readRanking(doc)]]) {
          if (!canEdit()) throw new Error("Prebieha iná operácia. Kontrola zastavená.");
          $("#sgo-guardian-status").textContent = `Kontrolujem ${{ bonus: "bonus", casino: "Herňu", nn: "NN", ranking: "TOP 3" }[key]}…`;
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
    return { render };
  }
  const api = { pageText, readBonus, readCasino, readNN, readRanking, displayState, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOGuardian = api;
})(globalThis);
