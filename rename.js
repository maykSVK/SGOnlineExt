(function (root) {
  "use strict";
  const W = typeof module !== "undefined" && module.exports ? require("./war.js") : root.SGOWar;
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();

  function readPlanets(doc) {
    const options = [...W.renameForm(doc).elements.namedItem("planeta").options];
    const planets = options.filter(option => option.value).map(option => ({
      id: option.value, name: clean(option.textContent)
    }));
    if (!planets.length || planets.some(planet => !planet.name) ||
      new Set(planets.map(planet => planet.id)).size !== planets.length) {
      throw new Error("Zoznam vlastných planét je prázdny alebo nečitateľný.");
    }
    return planets;
  }

  function filterPlanets(planets, query) {
    const term = C.normalize(clean(query));
    return planets.filter(planet => C.normalize(planet.name).includes(term));
  }

  function mount(container, { getDocument, postDocument, storage, log, canEdit, onRenamed = async () => {} }) {
    container.innerHTML = `<div class="sgo-feature-heading"><span class="sgo-eyebrow">SPRÁVA PLANÉT</span><h3>Premenovanie planét</h3>
      <p class="sgo-hint">Vyhľadaj časť názvu. Premenovanie ihneď odošle navrhnutý náhodný názov.</p></div>
      <div class="sgo-rename-tools"><input id="sgo-rename-search" type="search" placeholder="Hľadať planétu" aria-label="Hľadať planétu">
      <button type="button" id="sgo-rename-refresh">Obnoviť</button></div>
      <p id="sgo-rename-status" class="sgo-hint" role="status">Načítaj zoznam planét.</p>
      <div id="sgo-rename-list" class="sgo-rename-list" role="list" aria-label="Planéty" tabindex="0"></div>`;
    const $ = selector => container.querySelector(selector);
    const url = params => {
      const result = new URL("game.php", root.location.href);
      result.search = new URLSearchParams(params);
      return result.href;
    };
    const planetUrl = () => url({ page: "planety", s: "sp" });
    let planets = [], owner = "", history = [], working = false, loaded = false;
    const suggestions = new Map();
    const status = (text, error = false) => {
      $("#sgo-rename-status").textContent = text;
      $("#sgo-rename-status").classList.toggle("sgo-error", error);
    };
    function render() {
      const list = $("#sgo-rename-list");
      list.replaceChildren();
      const visible = filterPlanets(planets, $("#sgo-rename-search").value);
      if (!visible.length && loaded) {
        const empty = container.ownerDocument.createElement("p");
        empty.className = "sgo-hint";
        empty.textContent = "Žiadna planéta nezodpovedá vyhľadávaniu.";
        list.append(empty);
      }
      for (const planet of visible) {
        if (!suggestions.has(planet.id)) {
          suggestions.set(planet.id, W.randomPlanetName([...planets.map(item => item.name), ...suggestions.values()]));
        }
        const pending = history.some(record => record.owner === owner && record.planetId === planet.id && record.state === "pending");
        const row = container.ownerDocument.createElement("div");
        row.className = "sgo-rename-row";
        row.setAttribute("role", "listitem");
        const label = container.ownerDocument.createElement("div");
        const name = container.ownerDocument.createElement("strong");
        name.textContent = planet.name;
        const suggestion = container.ownerDocument.createElement("span");
        suggestion.textContent = pending ? "Výsledok neistý · obnov zoznam" : `→ ${suggestions.get(planet.id)}`;
        label.append(name, suggestion);
        const button = container.ownerDocument.createElement("button");
        button.type = "button";
        button.textContent = "Premenovať";
        button.disabled = working || pending;
        button.addEventListener("click", () => rename(planet, suggestions.get(planet.id)));
        row.append(label, button);
        list.append(row);
      }
      $("#sgo-rename-refresh").disabled = working;
    }
    async function refresh() {
      if (working) return;
      if (!canEdit()) { status("Najprv počkaj na dokončenie prebiehajúcej operácie.", true); return; }
      working = true;
      render();
      status("Načítavam planéty…");
      try {
        const currentOwner = W.readOwner(await getDocument(url({ page: "prehled" })));
        await W.withRenameLock(async () => {
          const currentPlanets = readPlanets(await getDocument(planetUrl()));
          const currentHistory = W.readRenameHistory(await storage.get(W.RENAMES_KEY));
          let changed = false;
          for (const record of currentHistory.filter(item => item.owner === currentOwner && item.state === "pending")) {
            const current = currentPlanets.find(item => item.id === record.planetId);
            if (current?.name === record.newName) { record.state = "done"; changed = true; }
            else if (current?.name === record.oldName) { record.state = "failed"; changed = true; }
          }
          if (changed) await storage.set(W.RENAMES_KEY, currentHistory);
          owner = currentOwner;
          planets = currentPlanets;
          history = currentHistory;
          loaded = true;
          suggestions.clear();
        });
        await onRenamed();
        status(`Načítaných ${planets.length} planét.`);
      } catch (error) {
        status(`Načítanie zlyhalo: ${error.message}`, true);
        log(`Premenovanie planét: načítanie zlyhalo: ${error.message}`, "error");
      } finally { working = false; render(); }
    }
    async function rename(planet, newName) {
      if (working || !canEdit()) { status("Najprv počkaj na dokončenie prebiehajúcej operácie.", true); return; }
      working = true;
      render();
      let record, sent = false;
      try {
        await W.withRenameLock(async () => {
          const currentOwner = W.readOwner(await getDocument(url({ page: "prehled" })));
          if (currentOwner !== owner) throw new Error("Prihlásený hráč sa zmenil; obnov zoznam.");
          const currentHistory = W.readRenameHistory(await storage.get(W.RENAMES_KEY));
          if (currentHistory.some(item => item.owner === owner && item.planetId === planet.id && item.state === "pending")) {
            throw new Error("Predchádzajúce premenovanie má neistý výsledok; obnov zoznam.");
          }
          const address = planetUrl();
          const doc = await getDocument(address);
          const body = W.renamePayload(doc, planet, newName);
          const action = new URL(W.renameForm(doc).getAttribute("action") || address, address);
          const expected = new URL(address);
          if (action.origin !== expected.origin || action.pathname !== expected.pathname ||
            action.searchParams.get("page") !== "planety" || action.searchParams.get("s") !== "sp") {
            throw new Error("Nerozpoznaná adresa formulára premenovania.");
          }
          if (!canEdit()) throw new Error("Začala iná operácia; premenovanie nebolo odoslané.");
          record = { owner, planetId: planet.id, oldName: planet.name, newName, attackIds: [], state: "pending", time: Date.now() };
          currentHistory.push(record);
          await storage.set(W.RENAMES_KEY, currentHistory);
          history = currentHistory;
          status(`Premenúvam ${planet.name} → ${newName}…`);
          sent = true;
          await postDocument(action.href, body);
          const verified = readPlanets(await getDocument(address)).find(item => item.id === planet.id);
          if (verified?.name !== newName) {
            if (verified?.name === planet.name) {
              await storage.set(W.RENAMES_KEY, currentHistory.map(item => item === record ? { ...item, state: "failed" } : item));
              record.state = "failed";
            }
            throw new Error("Hra nepotvrdila nový názov. Obnov zoznam pred ďalšou akciou.");
          }
          await storage.set(W.RENAMES_KEY, currentHistory.map(item => item === record ? { ...item, state: "done" } : item));
          record.state = "done";
          planets = planets.map(item => item.id === planet.id ? { ...item, name: newName } : item);
          suggestions.delete(planet.id);
        });
        await onRenamed();
        status(`Premenované ${planet.name} → ${newName}.`);
        log(`Premenovanie planét: ${planet.name} → ${newName}.`);
      } catch (error) {
        const uncertain = sent && record?.state === "pending" ? " Výsledok je neistý; obnov zoznam, zmenu neopakujem." : "";
        status(`Premenovanie zlyhalo: ${error.message}${uncertain}`, true);
        log(`Premenovanie planét: ${error.message}${uncertain}`, "error");
      } finally { working = false; render(); }
    }
    $("#sgo-rename-search").addEventListener("input", render);
    $("#sgo-rename-refresh").addEventListener("click", refresh);
    return { refresh, get isWorking() { return working; } };
  }
  const api = { readPlanets, filterPlanets, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGORename = api;
})(globalThis);
