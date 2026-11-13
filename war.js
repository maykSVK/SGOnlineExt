(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const ARMY_TARGET = 10000;
  const DEFAULT_DEFENSE_TARGETS = Object.freeze({ sdi: 200, bs: 500 });
  const DEFENSE_SETTINGS_KEY = "sgo-war-defense-settings";
  const SPY_KEY = "sgo-war-spies";
  const ARMY_DRAFT_KEY = "sgo-war-army-draft";
  const PLANET_DRAFT_KEY = "sgo-war-planet-draft";
  const RENAME_DRAFT_KEY = "sgo-war-rename-draft";
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();

  function defenseTargets(value = DEFAULT_DEFENSE_TARGETS) {
    if (!value || ![value.sdi, value.bs].every(target => Number.isSafeInteger(target) && target >= 0)) {
      throw new Error("Minimá SDI a BS musia byť nezáporné celé čísla.");
    }
    return { sdi: value.sdi, bs: value.bs };
  }

  function defenseDeficits(planet, targets) {
    return {
      ...planet,
      sdiDeficit: Math.max(0, targets.sdi - planet.sdi),
      bsDeficit: Math.max(0, targets.bs - planet.bs)
    };
  }

  function readOwner(doc) {
    const link = doc.querySelector('#os a[href*="hledat="]');
    const owner = link && new URL(link.getAttribute("href"), "https://stargame-online.cz/game.php").searchParams.get("hledat");
    if (!owner) throw new Error("Nepodarilo sa zistiť meno prihláseného hráča z prehľadu.");
    return owner;
  }

  function attackFilter(owner, type = "0") {
    if (!clean(owner)) throw new Error("Chýba meno hráča pre filter útokov.");
    return new URLSearchParams({
      rasa1: "0", rasa2: "0", stav: "0", utoky: type, texty: "2", text: owner, najit: "Najít"
    });
  }

  function spyFilter(owner) {
    return attackFilter(owner, "7");
  }

  async function loadReports(url, owner, postDocument, { spyOnly, now }) {
    const collected = [];
    const visited = new Set();
    const filter = spyOnly ? spyFilter(owner) : attackFilter(owner);
    let next = url;
    while (next) {
      if (visited.has(next)) throw new Error("Stránkovanie denníka útokov sa opakuje.");
      visited.add(next);
      const doc = await postDocument(next, new URLSearchParams(filter));
      const form = [...doc.forms].find(f => f.elements.namedItem("texty"));
      if (!form || form.elements.namedItem("texty")?.value !== "2" ||
        form.elements.namedItem("utoky")?.value !== filter.get("utoky") ||
        form.elements.namedItem("stav")?.value !== "0" ||
        form.elements.namedItem("text")?.value !== owner) {
        throw new Error("Hra nepotvrdila filter útokov na tvojho hráča.");
      }
      const table = [...doc.querySelectorAll("table")].find(t =>
        [...t.querySelectorAll("th")].some(cell => clean(cell.textContent) === "Obránce"));
      if (!table) throw new Error("Nenašiel sa filtrovaný denník útokov.");
      const entries = spyOnly ? readSpies(doc, owner) : readAttacks(doc, owner);
      collected.push(...entries);
      const older = spyOnly && entries.some(entry => entry.time < now - 86400000);
      const link = [...doc.querySelectorAll("a[href]")].find(a => /^Další\s*»/.test(clean(a.textContent)));
      if (!link || older) break;
      const candidate = new URL(link.getAttribute("href"), next);
      const start = new URL(url);
      if (candidate.origin !== start.origin || candidate.pathname !== start.pathname ||
        candidate.searchParams.get("page") !== "jednotky" ||
        !/^\d+$/.test(candidate.searchParams.get("strana") || "")) {
        throw new Error("Nerozpoznaný odkaz na ďalšiu stránku denníka.");
      }
      next = candidate.href;
    }
    return spyOnly ? recentSpies(collected, now)
      : [...new Map(collected.map(entry => [entry.id, entry])).values()].sort((a, b) => b.time - a.time);
  }

  function loadSpies(url, owner, postDocument, now = Date.now()) {
    return loadReports(url, owner, postDocument, { spyOnly: true, now });
  }

  function loadAttacks(url, owner, postDocument) {
    return loadReports(url, owner, postDocument, { spyOnly: false });
  }

  function randomPlanetName(existing, random = () => {
    const value = new Uint32Array(1);
    root.crypto.getRandomValues(value);
    return value[0] / 4294967296;
  }) {
    const used = new Set(existing.map(name => clean(name).toUpperCase()));
    for (let attempt = 0; attempt < 100; attempt++) {
      const letters = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(random() * 26))).join("");
      const name = `${letters}-${1000 + Math.floor(random() * 9000)}-${10 + Math.floor(random() * 90)}`;
      if (!used.has(name)) return name;
    }
    throw new Error("Nepodarilo sa vytvoriť voľný názov planéty.");
  }

  function spiedPlanets(spies, planets) {
    const grouped = new Map();
    for (const spy of spies) {
      if (!grouped.has(spy.planet)) {
        grouped.set(spy.planet, {
          name: spy.planet, planet: planets.find(planet => planet.name === spy.planet) || null, events: []
        });
      }
      grouped.get(spy.planet).events.push(spy);
    }
    return [...grouped.values()];
  }

  function gameTimestamp(year, month, day, hour, minute, second) {
    const utc = Date.UTC(year, month - 1, day, hour, minute, second);
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    });
    let result = utc;
    for (let step = 0; step < 2; step++) {
      const parts = Object.fromEntries(formatter.formatToParts(result).map(part => [part.type, part.value]));
      result += utc - Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second));
    }
    return result;
  }

  function applyRenameDraft(doc, draft) {
    const form = [...doc.forms].find(f => f.elements.namedItem("novy") && f.elements.namedItem("planeta"));
    if (!form) throw new Error("Nenašiel sa formulár premenovania v Správe planét.");
    const selector = form.elements.namedItem("planeta");
    const input = form.elements.namedItem("novy");
    const options = [...selector.options];
    const target = options.find(option => option.value === draft.planetId);
    if (!target || clean(target.textContent) !== draft.oldName) {
      throw new Error("Planéta už nemá pôvodný názov alebo ju už nevlastníš. Obnov prehľad.");
    }
    if (!/^[A-Z]{4}-\d{4}-\d{2}$/.test(draft.newName) ||
      options.some(option => clean(option.textContent) === draft.newName)) {
      throw new Error("Navrhnutý názov je neplatný alebo sa už používa.");
    }
    const selected = options.find(option => option.value === selector.value);
    if (clean(input.value) && clean(input.value) !== clean(selected?.textContent) && input.value !== draft.newName) {
      throw new Error("Formulár už obsahuje rozpracovaný názov; nič som neprepísal.");
    }
    selector.value = draft.planetId;
    selector.dispatchEvent(new Event("change", { bubbles: true }));
    input.value = draft.newName;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
    form.scrollIntoView({ block: "center" });
  }

  function number(text) {
    const match = String(text || "").match(/\d[\d\s\u00a0]*/);
    if (!match) return null;
    const value = Number(match[0].replace(/[\s\u00a0]/g, ""));
    return Number.isSafeInteger(value) ? value : null;
  }

  function readArmy(doc) {
    const input = doc.querySelector('input[name="jed2z"]');
    const table = input?.closest("table");
    const text = clean(table?.textContent);
    const raceMatch = text.match(/Je\s+v\s+RA\s*([\d\s\u00a0]+)/i);
    const ownMatch = text.match(/Máme\s*([\d\s\u00a0]+)/i);
    const race = raceMatch && number(raceMatch[1]);
    const own = ownMatch && number(ownMatch[1]);
    if (!input || race === null || own === null) {
      throw new Error("Nepodarilo sa prečítať počty univerzálov z R.armády.");
    }
    return { own, race, target: ARMY_TARGET, deficit: Math.max(0, ARMY_TARGET - own) };
  }

  function headerLabel(cell) {
    const image = cell.querySelector("img");
    return clean(image?.getAttribute("title") || image?.getAttribute("alt") || cell.textContent);
  }

  function readPlanets(doc, baseUrl = root.location?.href || "https://stargame-online.cz/game.php",
    targets = DEFAULT_DEFENSE_TARGETS) {
    targets = defenseTargets(targets);
    const table = doc.querySelector("table.planet-build-table");
    if (!table?.rows?.length) throw new Error("Nenašiel sa prehľad stavieb planét.");
    const headers = [...table.rows[0].cells].map(headerLabel);
    const indexOf = pattern => headers.findIndex(label => pattern.test(C.normalize(label)));
    const cityIndex = indexOf(/mesta/);
    const sdiIndex = indexOf(/\bsdi\b/);
    const bsIndex = indexOf(/\bbs\b/);
    if (cityIndex < 0 || sdiIndex < 0 || bsIndex < 0) {
      throw new Error("Stĺpce miest, SDI a BS sa nepodarilo rozpoznať.");
    }
    const planets = [];
    for (const row of [...table.rows].slice(1)) {
      const link = row.querySelector('a[href*="planeta="]');
      if (!link) continue;
      const url = new URL(link.getAttribute("href"), baseUrl);
      const id = url.searchParams.get("planeta");
      const name = clean(link.textContent);
      const cell = index => row.cells[index + 1];
      const cityText = clean(cell(cityIndex)?.textContent);
      const cityPair = cityText.match(/([\d\s\u00a0]+)\s*\/\s*([\d\s\u00a0]+)/);
      const cities = number(cityPair?.[1] || cityText);
      const maxCities = cityPair ? number(cityPair[2]) : null;
      const sdi = number(cell(sdiIndex)?.textContent);
      const bs = number(cell(bsIndex)?.textContent);
      if (!id || !name || cities === null || sdi === null || bs === null) {
        throw new Error(`Nečitateľné údaje o planéte ${name || "(bez názvu)"}.`);
      }
      planets.push(defenseDeficits({
        id, name, cities, maxCities, sdi, bs,
        cityDeficit: maxCities === null ? null : Math.max(0, maxCities - cities)
      }, targets));
    }
    if (!planets.length) throw new Error("Prehľad planét neobsahuje žiadne planéty.");
    return planets;
  }

  function readAttacks(doc, ownerName) {
    const owner = C.normalize(clean(ownerName));
    if (!owner) return [];
    let reportDate = null;
    const entries = [];
    for (const row of doc.querySelectorAll("table tr")) {
      const cells = [...row.cells];
      if (cells.length === 1) {
        const dateMatch = clean(cells[0].textContent).match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
        if (dateMatch) reportDate = dateMatch.slice(1).map(Number);
        continue;
      }
      if (cells.length !== 4) continue;
      const [time, attacker, defender, result] = cells.map(cell => clean(cell.textContent));
      const defenderName = defender.replace(/\s*\([^)]*\)\s*$/, "");
      if (C.normalize(defenderName) !== owner) continue;
      const timeMatch = time.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
      if (!timeMatch || !reportDate) throw new Error("Nepodarilo sa prečítať dátum alebo čas prijatého útoku.");
      const [day, month, year] = reportDate;
      const timestamp = gameTimestamp(year, month, day, Number(timeMatch[1]), Number(timeMatch[2]), Number(timeMatch[3]));
      const planetMatch = result.match(/„([^“]+)“|“([^”]+)”|"([^"]+)"/);
      const planet = planetMatch?.slice(1).find(Boolean) || "Planéta sa nedala prečítať";
      const id = `${timestamp}|${attacker}|${defender}|${result}`;
      entries.push({ id, time: timestamp, attacker, defender, planet, result });
    }
    return entries;
  }

  function readSpies(doc, ownerName) {
    return readAttacks(doc, ownerName).filter(entry => /\binformace\b/i.test(entry.result));
  }

  function recentSpies(history, now = Date.now()) {
    const cutoff = now - 24 * 60 * 60 * 1000;
    const unique = new Map();
    for (const item of history) {
      if (item && Number.isFinite(item.time) && item.time >= cutoff && item.time <= now + 5 * 60 * 1000 && item.id) {
        unique.set(item.id, item);
      }
    }
    return [...unique.values()].sort((a, b) => b.time - a.time);
  }

  function draftForm(form, draft) {
    if (!form) throw new Error("Nenašiel sa natívny formulár hry.");
    for (const [name, value] of Object.entries(draft.fields)) {
      const field = form.elements.namedItem(name);
      if (!field) throw new Error(`Vo formulári chýba pole ${name}.`);
      const current = clean(field.value);
      const next = String(value);
      if (current && current !== next) {
        throw new Error(`Pole ${name} už obsahuje inú hodnotu; nič som neprepísal.`);
      }
      field.value = next;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function applyArmyDraft(doc, draft) {
    const form = [...doc.forms].find(candidate => candidate.elements.namedItem("jed2z"));
    draftForm(form, { fields: { jed2z: draft.amount } });
  }

  function applyPlanetDraft(doc, draft) {
    const form = [...doc.forms].find(candidate => candidate.elements.namedItem("planeta") &&
      candidate.elements.namedItem("mest") && candidate.elements.namedItem("sdi") && candidate.elements.namedItem("bs"));
    if (!form) throw new Error("Nenašiel sa formulár na stavbu planéty.");
    const selector = form.elements.namedItem("planeta");
    if (![...selector.options].some(option => option.value === draft.planetId)) {
      throw new Error("Cieľová planéta sa vo formulári nenašla.");
    }
    const fields = {};
    if (draft.cities > 0) fields.mest = draft.cities;
    if (draft.sdi > 0) fields.sdi = draft.sdi;
    if (draft.bs > 0) fields.bs = draft.bs;
    for (const [name, value] of Object.entries(fields)) {
      const current = clean(form.elements.namedItem(name).value);
      if (current && current !== String(value)) {
        throw new Error(`Pole ${name} už obsahuje inú hodnotu; nič som neprepísal.`);
      }
    }
    selector.value = draft.planetId;
    selector.dispatchEvent(new Event("change", { bubbles: true }));
    draftForm(form, { fields });
  }

  function mount(container, { getDocument, postDocument, storage, session = root.sessionStorage,
    navigate = url => location.assign(url), log = () => {}, canEdit = () => true, revealGame = () => {} }) {
    container.innerHTML = `<section class="sgo-war">
      <div class="sgo-watch-heading"><strong>Vojna · vlastná pripravenosť</strong><button type="button" id="sgo-war-refresh">Obnoviť</button></div>
      <p class="sgo-note">Obnovenie je ručné. Akcie iba predvyplnia formulár hry; nič sa neodošle automaticky.</p>
      <div id="sgo-war-status" class="sgo-war-status" role="status">Zatiaľ neobnovené.</div>
      <section class="sgo-war-card"><strong>Univerzály</strong><div id="sgo-war-army"></div></section>
      <section class="sgo-war-card"><strong>Obrana planét</strong><div id="sgo-war-defense-summary"></div>
        <details class="sgo-watch-settings"><summary>Nastavenia obrany</summary>
          <div class="sgo-war-defense-settings">
            <label>Minimum SDI<input id="sgo-war-sdi-target" type="number" min="0" step="1"></label>
            <label>Minimum BS<input id="sgo-war-bs-target" type="number" min="0" step="1"></label>
            <button type="button" id="sgo-war-defense-save">Uložiť</button>
          </div>
          <p class="sgo-note">Minimá na každej planéte; zmena ihneď prepočíta prehľad aj predvyplnenie.</p>
        </details>
        <div class="sgo-war-table-scroll"><table class="sgo-war-table"><thead><tr><th>Planéta</th><th>Mestá</th><th>SDI</th><th>BS</th><th>Chýba</th><th></th></tr></thead><tbody id="sgo-war-planets"></tbody></table></div>
      </section>
      <section class="sgo-war-card"><strong>Prijaté špionáže · 24 h</strong>
        <div id="sgo-war-spy-summary"></div><div id="sgo-war-spies"></div>
      </section>
      <section class="sgo-war-card"><strong>Všetky útoky na mňa</strong>
        <p id="sgo-war-attack-summary" class="sgo-note">Zatiaľ neobnovené.</p>
        <div class="sgo-war-attacks-scroll" tabindex="0" role="region" aria-label="Všetky útoky na mňa">
          <table class="sgo-war-table"><thead><tr><th>Čas</th><th>Útočník</th><th>Výsledok</th></tr></thead><tbody id="sgo-war-attacks"></tbody></table>
        </div>
      </section>
    </section>`;
    const $ = selector => container.querySelector(selector);
    let army = null;
    let planets = [];
    let spies = [];
    let attacks = [];
    let newSpyIds = new Set();
    let checking = false;
    let lastUpdated = null;
    let ownerName = "";
    let targets = defenseTargets();
    let savingSettings = false;
    const renameSuggestions = new Map();

    function status(text, error = false) {
      const element = $("#sgo-war-status");
      element.textContent = text;
      element.dataset.state = error ? "error" : "ok";
    }

    function button(text, title, action) {
      const element = container.ownerDocument.createElement("button");
      element.type = "button";
      element.textContent = text;
      element.title = title;
      element.addEventListener("click", action);
      return element;
    }

    function render() {
      const armyTarget = $("#sgo-war-army");
      armyTarget.replaceChildren();
      if (army) {
        const line = container.ownerDocument.createElement("p");
        line.textContent = `Máme ${army.own.toLocaleString("sk-SK")} · v RA ${army.race.toLocaleString("sk-SK")} · cieľ ${ARMY_TARGET.toLocaleString("sk-SK")}`;
        armyTarget.append(line);
        if (army.deficit > 0) {
          const action = container.ownerDocument.createElement("div");
          action.className = "sgo-war-action";
          action.append(
            container.ownerDocument.createTextNode(`Chýba ${army.deficit.toLocaleString("sk-SK")}. `),
            army.race >= army.deficit
              ? button("Predvyplniť presun z RA", "Otvorí R.armádu a vyplní iba počet; odoslanie ostáva na vás.", prepareArmy)
              : container.ownerDocument.createTextNode(`V RA je dostupných iba ${army.race.toLocaleString("sk-SK")}.`)
          );
          armyTarget.append(action);
        } else {
          const ok = container.ownerDocument.createElement("span");
          ok.className = "sgo-war-ok";
          ok.textContent = "Cieľ splnený";
          armyTarget.append(ok);
        }
      }

      const summary = $("#sgo-war-defense-summary");
      const body = $("#sgo-war-planets");
      body.replaceChildren();
      if (planets.length) {
        const deficient = planets.filter(planet => planet.cityDeficit > 0 || planet.sdiDeficit || planet.bsDeficit);
        summary.textContent = `${planets.length} planét · ${deficient.length} pod cieľom`;
        for (const planet of deficient) {
          const row = container.ownerDocument.createElement("tr");
          const values = [
            planet.name,
            planet.maxCities === null ? `${planet.cities.toLocaleString("sk-SK")} · max ?` : `${planet.cities.toLocaleString("sk-SK")} / ${planet.maxCities.toLocaleString("sk-SK")}`,
            planet.sdi.toLocaleString("sk-SK"),
            planet.bs.toLocaleString("sk-SK"),
            `${planet.cityDeficit > 0 ? `Mestá ${planet.cityDeficit.toLocaleString("sk-SK")} · ` : ""}SDI ${planet.sdiDeficit.toLocaleString("sk-SK")} · BS ${planet.bsDeficit.toLocaleString("sk-SK")}`
          ];
          for (const value of values) {
            const cell = container.ownerDocument.createElement("td");
            cell.textContent = value;
            row.append(cell);
          }
          const actionCell = container.ownerDocument.createElement("td");
          const needs = [
            planet.cityDeficit > 0 ? `${planet.cityDeficit} miest` : "",
            planet.sdiDeficit > 0 ? `${planet.sdiDeficit} SDI` : "",
            planet.bsDeficit > 0 ? `${planet.bsDeficit} BS` : ""
          ].filter(Boolean).join(", ");
          actionCell.append(button("Predvyplniť", `Predvyplní ${needs} pre ${planet.name}; nič neodošle.`, () => preparePlanet(planet)));
          row.append(actionCell);
          body.append(row);
        }
        if (!deficient.length) {
          const row = container.ownerDocument.createElement("tr");
          const cell = container.ownerDocument.createElement("td");
          cell.colSpan = 6;
          cell.className = "sgo-war-ok";
          cell.textContent = "Všetky planéty spĺňajú cieľ obrany.";
          row.append(cell);
          body.append(row);
        }
      }

      const spySummary = $("#sgo-war-spy-summary");
      const spyList = $("#sgo-war-spies");
      spyList.replaceChildren();
      spySummary.textContent = !ownerName
        ? "Obnov prehľad: meno hráča a filter sa nastavia automaticky z hry."
        : !lastUpdated
          ? "Zatiaľ neobnovené; klikni na Obnoviť."
          : `${ownerName} · ${spies.length} špionáží za 24 h · ${spiedPlanets(spies, planets).length} dotknutých planét.`;
      for (const group of spiedPlanets(spies, planets)) {
        const spy = group.events[0];
        const row = container.ownerDocument.createElement("div");
        row.className = "sgo-war-spy-row";
        const time = container.ownerDocument.createElement("time");
        time.dateTime = new Date(spy.time).toISOString();
        time.textContent = new Date(spy.time).toLocaleString("sk-SK");
        const details = container.ownerDocument.createElement("span");
        details.textContent = `${group.name} · ${group.events.length}× · ${spy.attacker} · ${spy.result}`;
        row.append(time, details);
        if (group.events.some(event => newSpyIds.has(event.id))) {
          const badge = container.ownerDocument.createElement("b");
          badge.textContent = "NOVÉ";
          row.append(badge);
        }
        const action = container.ownerDocument.createElement("div");
        action.className = "sgo-war-rename";
        if (group.planet) {
          if (!renameSuggestions.has(group.planet.id)) {
            renameSuggestions.set(group.planet.id, randomPlanetName([
              ...planets.map(planet => planet.name), ...renameSuggestions.values()
            ]));
          }
          const suggestion = renameSuggestions.get(group.planet.id);
          const label = container.ownerDocument.createElement("span");
          label.textContent = `Nový názov: ${suggestion}`;
          action.append(label, button("Premenovať…", "Otvorí Správu planét a predvyplní názov. Potvrdíš ho tlačidlom Přejmenovat v hre.",
            () => prepareRename(group.planet, suggestion)));
        } else {
          action.textContent = "Planéta už nie je pod týmto názvom v tvojom zozname (premenovaná alebo nevlastnená).";
        }
        row.append(action);
        spyList.append(row);
      }
      const attackBody = $("#sgo-war-attacks");
      attackBody.replaceChildren();
      $("#sgo-war-attack-summary").textContent = lastUpdated
        ? `${ownerName} · ${attacks.length} útokov · celý dostupný denník, všetky typy aj výsledky.`
        : "Zatiaľ neobnovené; klikni na Obnoviť.";
      for (const attack of attacks) {
        const row = container.ownerDocument.createElement("tr");
        for (const value of [new Date(attack.time).toLocaleString("sk-SK"), attack.attacker, attack.result]) {
          const cell = container.ownerDocument.createElement("td");
          cell.textContent = value;
          row.append(cell);
        }
        attackBody.append(row);
      }
      if (lastUpdated && !attacks.length) {
        const row = container.ownerDocument.createElement("tr");
        const cell = container.ownerDocument.createElement("td");
        cell.colSpan = 3;
        cell.textContent = "V dostupnom denníku nie sú žiadne útoky na teba.";
        row.append(cell);
        attackBody.append(row);
      }
      if (lastUpdated) $("#sgo-war-status").dataset.updated = new Date(lastUpdated).toLocaleString("sk-SK");
    }

    async function refresh() {
      if (checking) return;
      if (savingSettings) {
        status("Najprv počkaj na uloženie nastavení obrany.", true);
        return;
      }
      if (!canEdit()) {
        status("Najprv zastav prebiehajúcu operáciu.", true);
        return;
      }
      checking = true;
      $("#sgo-war-refresh").disabled = true;
      status("Načítavam armádu, planéty a denník útokov…");
      try {
        if (!await ready) throw new Error("Nastavenia obrany sa nepodarilo načítať; obnov stránku.");
        ownerName = readOwner(await getDocument(gameUrl({ page: "prehled" })));
        const armyDoc = await getDocument(gameUrl({ page: "jednotky", akce: "armada" }));
        const nextArmy = readArmy(armyDoc);
        const planetDoc = await getDocument(gameUrl({ page: "planety" }));
        const nextPlanets = readPlanets(planetDoc, undefined, targets);
        const nextAttacks = await loadAttacks(gameUrl({ page: "jednotky" }), ownerName, postDocument);
        const current = recentSpies(nextAttacks.filter(entry => /\binformace\b/i.test(entry.result)));
        const previous = await storage.get(SPY_KEY) || [];
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const validPrevious = recentSpies(previous, Date.now()).filter(entry =>
          C.normalize(entry.defender.replace(/\s*\([^)]*\)\s*$/, "")) === C.normalize(ownerName)
        );
        const known = new Set(validPrevious.map(entry => entry.id));
        newSpyIds = new Set(current.filter(entry => entry.time >= cutoff && !known.has(entry.id)).map(entry => entry.id));
        spies = recentSpies([...validPrevious, ...current], Date.now());
        for (const entry of current) {
          if (newSpyIds.has(entry.id)) {
            log(`Vojna: nová špionáž od ${entry.attacker} na planétu ${entry.planet}: ${entry.result}`);
          }
        }
        await storage.set(SPY_KEY, spies);
        army = nextArmy;
        planets = nextPlanets;
        attacks = nextAttacks;
        lastUpdated = Date.now();
        render();
        const fresh = newSpyIds.size;
        status(`Obnovené ${new Date(lastUpdated).toLocaleTimeString("sk-SK")}${fresh ? ` · ${fresh} nová špionáž` : ""}.`);
        log(`Vojna: prehľad obnovený; ${planets.length} planét, ${attacks.length} útokov na teba, ${fresh} nových špionáží.`);
      } catch (error) {
        status(`Obnovenie zlyhalo: ${error.message}`, true);
        log(`Vojna: obnovenie zlyhalo: ${error.message}`, "error");
      } finally {
        checking = false;
        $("#sgo-war-refresh").disabled = false;
      }
    }

    function gameUrl(params) {
      const url = new URL("game.php", location.href);
      url.search = new URLSearchParams(params);
      return url.href;
    }

    async function prepareRename(planet, newName) {
      if (!canEdit()) {
        status("Najprv zastav prebiehajúcu operáciu.", true);
        return;
      }
      try {
        const draft = { planetId: planet.id, oldName: planet.name, newName, createdAt: Date.now() };
        const params = new URL(location.href).searchParams;
        if (params.get("page") === "planety" && params.get("s") === "sp") {
          applyRenameDraft(container.ownerDocument, draft);
          revealGame();
          status(`Premenovanie ${planet.name} → ${newName} je predvyplnené. Potvrď ho v hre.`);
        } else {
          session.setItem(RENAME_DRAFT_KEY, JSON.stringify(draft));
          await navigate(gameUrl({ page: "planety", s: "sp" }));
        }
        log(`Vojna: pripravené premenovanie ${planet.name} → ${newName}; potvrdenie zostáva na používateľovi.`);
      } catch (error) {
        status(`Premenovanie sa nepodarilo pripraviť: ${error.message}`, true);
        log(`Vojna: príprava premenovania zlyhala: ${error.message}`, "error");
      }
    }

    async function prepareArmy() {
      if (!canEdit() || !army || !army.deficit) return;
      try {
        const url = gameUrl({ page: "jednotky", akce: "armada" });
        await storage.set(ARMY_DRAFT_KEY, { amount: army.deficit, createdAt: Date.now() });
        if (new URL(location.href).searchParams.get("akce") === "armada") {
          applyArmyDraft(document, { amount: army.deficit });
          await storage.set(ARMY_DRAFT_KEY, null);
          status(`Pole „Z RA“ je predvyplnené na ${army.deficit.toLocaleString("sk-SK")}; skontroluj formulár a odošli ho ručne.`);
          log(`Vojna: predvyplnený presun ${army.deficit} univerzálov z RA; odoslanie čaká na používateľa.`);
        } else {
          log(`Vojna: otvorenie R.armády na predvyplnenie ${army.deficit} univerzálov z RA.`);
          await navigate(url);
        }
      } catch (error) {
        let message = error.message;
        try { await storage.set(ARMY_DRAFT_KEY, null); }
        catch (cleanupError) { message += `; nepodarilo sa zrušiť čakajúci návrh: ${cleanupError.message}`; }
        status(`Predvyplnenie armády zlyhalo: ${message}`, true);
      }
    }

    async function preparePlanet(planet) {
      if (!canEdit()) return;
      const draft = {
        planetId: planet.id,
        cities: planet.cityDeficit,
        sdi: planet.sdiDeficit,
        bs: planet.bsDeficit,
        createdAt: Date.now()
      };
      try {
        const url = gameUrl({ page: "planety" });
        await storage.set(PLANET_DRAFT_KEY, draft);
        if (new URL(location.href).searchParams.get("page") === "planety") {
          applyPlanetDraft(document, draft);
          await storage.set(PLANET_DRAFT_KEY, null);
          status(`Formulár pre ${planet.name} je predvyplnený; skontroluj ho a odošli ručne.`);
          log(`Vojna: predvyplnený formulár obrany planéty ${planet.name}; odoslanie čaká na používateľa.`);
        } else {
          log(`Vojna: otvorenie stavby planéty ${planet.name} na predvyplnenie obrany.`);
          await navigate(url);
        }
      } catch (error) {
        let message = error.message;
        try { await storage.set(PLANET_DRAFT_KEY, null); }
        catch (cleanupError) { message += `; nepodarilo sa zrušiť čakajúci návrh: ${cleanupError.message}`; }
        status(`Predvyplnenie obrany zlyhalo: ${message}`, true);
      }
    }

    async function applyPendingDrafts() {
      const params = new URL(location.href).searchParams;
      const rename = params.get("page") === "planety" && params.get("s") === "sp";
      const key = rename ? RENAME_DRAFT_KEY : params.get("page") === "planety"
        ? PLANET_DRAFT_KEY
        : params.get("page") === "jednotky" && params.get("akce") === "armada"
          ? ARMY_DRAFT_KEY
          : null;
      if (!key) return;
      try {
        const draft = rename ? JSON.parse(session.getItem(key) || "null") : await storage.get(key);
        if (!draft) return;
        if (rename) session.removeItem(key);
        if (!Number.isFinite(draft.createdAt) || Date.now() - draft.createdAt >= 10 * 60 * 1000) {
          if (!rename) await storage.set(key, null);
          status("Čakajúce predvyplnenie vypršalo; znovu ho spusti z prehľadu Vojna.", true);
          return;
        }
        if (rename) {
          if (!canEdit()) throw new Error("Najprv zastav prebiehajúcu operáciu a znovu priprav premenovanie.");
          applyRenameDraft(container.ownerDocument, draft);
          revealGame();
          status(`Premenovanie ${draft.oldName} → ${draft.newName} je predvyplnené. Potvrď ho v hre.`);
          log(`Vojna: predvyplnené premenovanie ${draft.oldName} → ${draft.newName}; nič nebolo odoslané.`);
        } else if (key === ARMY_DRAFT_KEY) {
          applyArmyDraft(document, draft);
          status(`Pole „Z RA“ je predvyplnené na ${draft.amount.toLocaleString("sk-SK")}; skontroluj formulár a odošli ho ručne.`);
          log(`Vojna: predvyplnený presun ${draft.amount} univerzálov z RA; odoslanie čaká na používateľa.`);
        } else {
          applyPlanetDraft(document, draft);
          status("Formulár stavby je predvyplnený; skontroluj ho a odošli ručne.");
          log(`Vojna: predvyplnený formulár obrany planéty ${draft.planetId}; odoslanie čaká na používateľa.`);
        }
        if (!rename) await storage.set(key, null);
      } catch (error) {
        let message = error.message;
        try { if (rename) session.removeItem(key); else await storage.set(key, null); }
        catch (cleanupError) {
          message += `; návrh ${key} sa nepodarilo zrušiť: ${cleanupError.message}`;
        }
        status(`Predvyplnenie sa nepodarilo: ${message}`, true);
        log(`Vojna: predvyplnenie zlyhalo: ${message}`, "error");
      }
    }

    async function restoreDefenseSettings() {
      try {
        const saved = await storage.get(DEFENSE_SETTINGS_KEY);
        targets = defenseTargets(saved == null ? undefined : saved);
        $("#sgo-war-sdi-target").value = String(targets.sdi);
        $("#sgo-war-bs-target").value = String(targets.bs);
        return true;
      } catch (error) {
        status(`Načítanie nastavení obrany zlyhalo: ${error.message}`, true);
        log(`Vojna: načítanie nastavení obrany zlyhalo: ${error.message}`, "error");
        return false;
      }
    }

    const ready = restoreDefenseSettings();
    $("#sgo-war-defense-save").addEventListener("click", async () => {
      if (savingSettings) return;
      savingSettings = true;
      $("#sgo-war-defense-save").disabled = true;
      try {
        if (!await ready) throw new Error("Nastavenia obrany sa nepodarilo načítať; obnov stránku.");
        if (checking || !canEdit()) throw new Error("Najprv počkaj na dokončenie prebiehajúcej operácie.");
        const sdi = $("#sgo-war-sdi-target").value.trim();
        const bs = $("#sgo-war-bs-target").value.trim();
        if (!sdi || !bs) throw new Error("Vyplň obe minimá obrany.");
        const next = defenseTargets({ sdi: Number(sdi), bs: Number(bs) });
        await storage.set(DEFENSE_SETTINGS_KEY, next);
        targets = next;
        planets = planets.map(planet => defenseDeficits(planet, targets));
        render();
        status("Nastavenia obrany uložené; prehľad je prepočítaný.");
        log(`Vojna: minimá obrany uložené: ${targets.sdi} SDI + ${targets.bs} BS na planétu.`);
      } catch (error) {
        status(`Uloženie nastavení obrany zlyhalo: ${error.message}`, true);
        log(`Vojna: uloženie nastavení obrany zlyhalo: ${error.message}`, "error");
      } finally {
        savingSettings = false;
        $("#sgo-war-defense-save").disabled = false;
      }
    });
    $("#sgo-war-refresh").addEventListener("click", refresh);
    render();
    applyPendingDrafts();
    return { refresh, render, ready };
  }

  const api = { ARMY_TARGET, DEFAULT_DEFENSE_TARGETS, defenseTargets, readOwner, attackFilter, spyFilter, loadAttacks, loadSpies, randomPlanetName, spiedPlanets,
    applyRenameDraft, readArmy, readPlanets, readAttacks, readSpies, recentSpies, applyArmyDraft, applyPlanetDraft, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOWar = api;
})(globalThis);
