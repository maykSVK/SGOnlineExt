(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const L = typeof module !== "undefined" && module.exports ? require("./lottery.js") : root.SGOLottery;
  const routes = {
    bonus: "game.php?page=prehled&akce=denniBonus",
    casino: "game.php?page=obchod&s=6",
    nn: "game.php?page=posta&s=4"
  };
  function readBonus(text) {
    const clean = C.clean(text);
    if (!/Každý den máte 5 zatočení zdarma/.test(clean)) throw new Error("Nerozpoznaná stránka denného bonusu.");
    const attempts = clean.match(/(?:^|\s)(\d+)\s*x(?:\s|$)/);
    return attempts ? `Zobrazené pokusy: ${attempts[1]}. Prevzatie výhry over ručne.` : "Neznáme — počet pokusov nie je čitateľný.";
  }
  function readCasino(text) {
    const clean = C.clean(text);
    if (!/Super 6/.test(clean)) throw new Error("Nerozpoznaná stránka Herne.");
    if (/Již máme vsazeno/.test(clean)) {
      const count = clean.match(/Počet slosování:\s*(\d+)/);
      return count ? `Vsadené · počet slosovaní: ${count[1]}` : "Vsadené · počet slosovaní neznámy";
    }
    return "Neznáme — otvor Herňu a over, či treba vsadiť.";
  }
  function readNN(text) {
    let date;
    for (const line of text.split("\n")) {
      const day = line.match(/»\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
      if (day) date = `${day[1]}. ${day[2]}. ${day[3]}`;
      const match = line.match(/NN\s*-\s*další\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      if (match && date) {
        return `Posledné hlásenie ${date}: ďalšia NN ${match[1]}–${match[2]} (čas konca môže byť nasledujúci deň).`;
      }
    }
    return "Neznáme — v načítanej pošte nie je čitateľné hlásenie NN.";
  }
  function mount(container, { getDocument, log, canEdit, storage }) {
    container.innerHTML = `<div class="sgo-feature-heading"><span class="sgo-eyebrow">RUČNÁ KONTROLA</span><h3>Strážca</h3></div>
      <button type="button" id="sgo-guardian-refresh">Aktualizovať</button>
      <p class="sgo-hint" id="sgo-guardian-status" role="status">Údaje sa načítajú iba po kliknutí. Bonus ani stávku neodosielam.</p>
      <div id="sgo-guardian-items"></div>
      <p class="sgo-hint" id="sgo-lottery-history">História: 0 zachytených žrebovaní.</p>
      <p class="sgo-hint" id="sgo-lottery-sync" role="status">Synchronizácia zatiaľ neoverená.</p>
      <details><summary>Gist synchronizácia</summary>
        <label class="sgo-planet">Gist ID alebo odkaz<input id="sgo-gist-id" type="text" autocomplete="off"></label>
        <label class="sgo-planet">GitHub token (iba oprávnenie gist)<input id="sgo-gist-token" type="password" autocomplete="off" spellcheck="false"></label>
        <button type="button" id="sgo-gist-save">Uložiť nastavenia</button>
        <p class="sgo-hint">Token zostáva v lokálnom úložisku tohto zariadenia. Prázdny token vypne synchronizáciu. Uloženie nerobí sieťové požiadavky.</p>
      </details>`;
    const $ = selector => container.querySelector(selector);
    let checking = false;
    let state = {};
    let history = [];
    let config = {};
    let restored = false;
    function renderHistory() {
      $("#sgo-lottery-history").textContent = `História: ${history.length} zachytených žrebovaní.${history.length ? ` Posledné: ${history[history.length - 1].at.replace("T", " ")} (čas hry).` : ""} Nemusí obsahovať všetky žrebovania.`;
    }
    function render() {
      $("#sgo-guardian-items").replaceChildren();
      for (const [key, title] of [["bonus", "Denný bonus"], ["casino", "Herňa"], ["nn", "NN"]]) {
        const card = document.createElement("article");
        card.className = "sgo-attack";
        const heading = document.createElement("strong"); heading.textContent = title;
        const detail = document.createElement("p"); detail.className = "sgo-note";
        detail.textContent = state[key]?.text || "Neznáme";
        const time = document.createElement("p"); time.className = "sgo-note";
        time.textContent = state[key]?.time ? `Posledná kontrola: ${new Date(state[key].time).toLocaleString("sk-SK")}` : "Zatiaľ nekontrolované";
        const link = document.createElement("a"); link.href = routes[key]; link.textContent = "Otvoriť";
        card.append(heading, detail, time, link); $("#sgo-guardian-items").append(card);
      }
    }
    async function restore() {
      try {
        state = await storage.get("sgo-guardian") || {};
        history = L.merge(await storage.get("sgo-lottery-history") || []);
        config = await storage.get("sgo-gist-config") || {};
        $("#sgo-gist-id").value = config.id || "";
        $("#sgo-gist-token").value = config.token || "";
        render(); renderHistory(); restored = true;
      }
      catch (error) {
        $("#sgo-guardian-status").textContent = `Chyba načítania uložených kontrol: ${error.message}`;
        log(`Strážca: ${error.message}`, "error");
      }
    }
    render();
    const ready = restore();
    $("#sgo-gist-save").addEventListener("click", async () => {
      try {
        await ready;
        if (!restored || checking) throw new Error("Počkaj na dokončenie načítania alebo kontroly.");
        const token = $("#sgo-gist-token").value.trim();
        const id = $("#sgo-gist-id").value.trim();
        const next = { id: id ? L.gistId(id) : "", token };
        if (token && !next.id) throw new Error("K tokenu doplň Gist ID.");
        await storage.set("sgo-gist-config", next);
        config = next;
        $("#sgo-lottery-sync").textContent = "Nastavenia uložené. Synchronizácia až po kliknutí na Aktualizovať.";
      } catch (error) { $("#sgo-lottery-sync").textContent = error.message; }
    });
    $("#sgo-guardian-refresh").addEventListener("click", async () => {
      if (checking) return;
      checking = true; $("#sgo-guardian-refresh").disabled = true;
      try {
        await ready;
        if (!restored) throw new Error("Uložené údaje sa nepodarilo načítať. Kontrola zastavená.");
        if (!canEdit()) throw new Error("Najprv zastav útoky a počkaj na dokončenie operácie.");
        for (const [key, read] of [["bonus", readBonus], ["casino", readCasino], ["nn", readNN]]) {
          if (!canEdit()) throw new Error("Prebieha iná operácia. Kontrola zastavená.");
          $("#sgo-guardian-status").textContent = `Kontrolujem: ${{ bonus: "Denný bonus", casino: "Herňa", nn: "NN" }[key]}…`;
          try {
            const doc = await getDocument(new URL(routes[key], location.href).href);
            const body = doc.body.cloneNode(true);
            body.querySelectorAll("script,style").forEach(element => element.remove());
            body.querySelectorAll("tr,br,p,div,h1,h2").forEach(element => element.append("\n"));
            state[key] = { text: read(body.textContent), time: Date.now() };
            if (key === "casino") {
              history = L.merge(history, L.readDraws(body.textContent));
              await storage.set("sgo-lottery-history", history);
              renderHistory();
            }
            log(`Strážca: ${state[key].text}`);
          } catch (error) {
            state[key] = { text: `Neznáme — kontrola zlyhala: ${error.message}`, time: Date.now() };
            log(`Strážca: ${error.message}`, "error");
            render();
            await storage.set("sgo-guardian", state);
            throw error;
          }
          render();
          await storage.set("sgo-guardian", state);
        }
        if (config.id && config.token) {
          $("#sgo-lottery-sync").textContent = "Synchronizujem históriu s Gistom…";
          try {
            history = await L.sync(config, history);
            await storage.set("sgo-lottery-history", history);
            renderHistory();
            $("#sgo-lottery-sync").textContent = `Synchronizované ${new Date().toLocaleString("sk-SK")}`;
          } catch (error) {
            $("#sgo-lottery-sync").textContent = `Nesynchronizované: ${error.message}`;
            throw error;
          }
        } else $("#sgo-lottery-sync").textContent = "Iba lokálna história — nastav Gist ID a token.";
        $("#sgo-guardian-status").textContent = "Kontrola dokončená. Ďalšie načítanie iba po kliknutí.";
      } catch (error) {
        $("#sgo-guardian-status").textContent = `Kontrola zastavená: ${error.message}`;
        log(`Strážca: ${error.message}`, "error");
      } finally { checking = false; $("#sgo-guardian-refresh").disabled = false; }
    });
  }
  const api = { readBonus, readCasino, readNN, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOGuardian = api;
})(globalThis);
