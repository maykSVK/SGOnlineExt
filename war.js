(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const ARMY_TARGET = 10000;
  const DEFENSE_TARGET = 500;
  const SPY_KEY = "sgo-war-spies";
  const ARMY_DRAFT_KEY = "sgo-war-army-draft";
  const PLANET_DRAFT_KEY = "sgo-war-planet-draft";
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();

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

  function readPlanets(doc, baseUrl = root.location?.href || "https://stargame-online.cz/game.php") {
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
      planets.push({
        id, name, cities, maxCities, sdi, bs,
        sdiDeficit: Math.max(0, DEFENSE_TARGET - sdi),
        bsDeficit: Math.max(0, DEFENSE_TARGET - bs),
        cityDeficit: maxCities === null ? null : Math.max(0, maxCities - cities)
      });
    }
    if (!planets.length) throw new Error("Prehľad planét neobsahuje žiadne planéty.");
    return planets;
  }

  function readSpies(doc, ownerName) {
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
      if (cells.length !== 4 || !reportDate) continue;
      const [time, attacker, defender, result] = cells.map(cell => clean(cell.textContent));
      if (!/\binformace\b/i.test(result)) continue;
      const defenderName = defender.replace(/\s*\([^)]*\)\s*$/, "");
      if (C.normalize(defenderName) !== owner) continue;
      const timeMatch = time.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
      if (!timeMatch) continue;
      const [day, month, year] = reportDate;
      const timestamp = new Date(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2]), Number(timeMatch[3])).getTime();
      const planetMatch = result.match(/„([^“]+)“|“([^”]+)”|"([^"]+)"/);
      const planet = planetMatch?.slice(1).find(Boolean) || "Planéta sa nedala prečítať";
      const id = `${timestamp}|${attacker}|${defender}|${result}`;
      entries.push({ id, time: timestamp, attacker, defender, planet, result });
    }
    return entries;
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

  function mount(container, { getDocument, storage, navigate = url => location.assign(url), log = () => {}, canEdit = () => true }) {
    container.innerHTML = `<section class="sgo-war">
      <div class="sgo-watch-heading"><strong>Vojna · vlastná pripravenosť</strong><button type="button" id="sgo-war-refresh">Obnoviť</button></div>
      <p class="sgo-note">Obnovenie je ručné. Akcie iba predvyplnia formulár hry; nič sa neodošle automaticky.</p>
      <div id="sgo-war-status" class="sgo-war-status" role="status">Zatiaľ neobnovené.</div>
      <section class="sgo-war-card"><strong>Univerzály</strong><div id="sgo-war-army"></div></section>
      <section class="sgo-war-card"><strong>Obrana planét</strong><div id="sgo-war-defense-summary"></div>
        <div class="sgo-war-table-scroll"><table class="sgo-war-table"><thead><tr><th>Planéta</th><th>Mestá</th><th>SDI</th><th>BS</th><th>Chýba</th><th></th></tr></thead><tbody id="sgo-war-planets"></tbody></table></div>
      </section>
      <section class="sgo-war-card"><strong>Prijaté špionáže · 24 h</strong>
        <label class="sgo-war-owner">Meno môjho hráča<input id="sgo-war-owner" type="text" autocomplete="off" placeholder="Zadaj presné meno z hry"></label>
        <div id="sgo-war-spy-summary"></div><div id="sgo-war-spies"></div>
      </section>
    </section>`;
    const $ = selector => container.querySelector(selector);
    let army = null;
    let planets = [];
    let spies = [];
    let newSpyIds = new Set();
    let checking = false;
    let lastUpdated = null;
    let ownerName = "";

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
        summary.textContent = `${planets.length} planét · cieľ ${DEFENSE_TARGET} SDI + ${DEFENSE_TARGET} BS na každej · ${deficient.length} pod cieľom`;
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
        ? "Zadaj presné meno hráča, aby sa oddelili útoky na tvoj účet."
        : !lastUpdated
          ? "Zatiaľ neobnovené; klikni na Obnoviť."
          : `${spies.length} záznamov za posledných 24 hodín.`;
      for (const spy of spies) {
        const row = container.ownerDocument.createElement("div");
        row.className = "sgo-war-spy-row";
        const time = container.ownerDocument.createElement("time");
        time.dateTime = new Date(spy.time).toISOString();
        time.textContent = new Date(spy.time).toLocaleString("sk-SK");
        const details = container.ownerDocument.createElement("span");
        details.textContent = `${spy.attacker} · ${spy.planet} · ${spy.result}`;
        row.append(time, details);
        if (newSpyIds.has(spy.id)) {
          const badge = container.ownerDocument.createElement("b");
          badge.textContent = "NOVÉ";
          row.append(badge);
        }
        spyList.append(row);
      }
      if (lastUpdated) $("#sgo-war-status").dataset.updated = new Date(lastUpdated).toLocaleString("sk-SK");
    }

    async function refresh() {
      if (checking) return;
      checking = true;
      $("#sgo-war-refresh").disabled = true;
      status("Načítavam armádu, planéty a denník útokov…");
      try {
        const armyDoc = await getDocument(gameUrl({ page: "jednotky", akce: "armada" }));
        const nextArmy = readArmy(armyDoc);
        const planetDoc = await getDocument(gameUrl({ page: "planety" }));
        const nextPlanets = readPlanets(planetDoc);
        const attackDoc = await getDocument(gameUrl({ page: "jednotky" }));
        ownerName = $("#sgo-war-owner").value.trim();
        await storage.set("sgo-war-owner", ownerName);
        const current = ownerName ? readSpies(attackDoc, ownerName) : [];
        if (ownerName) {
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
        } else {
          spies = [];
          newSpyIds = new Set();
        }
        army = nextArmy;
        planets = nextPlanets;
        lastUpdated = Date.now();
        render();
        const fresh = newSpyIds.size;
        status(`Obnovené ${new Date(lastUpdated).toLocaleTimeString("sk-SK")}${fresh ? ` · ${fresh} nová špionáž` : ""}.`);
        log(`Vojna: prehľad obnovený; ${planets.length} planét, ${fresh} nových špionáží.`);
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
      const key = params.get("page") === "planety"
        ? PLANET_DRAFT_KEY
        : params.get("page") === "jednotky" && params.get("akce") === "armada"
          ? ARMY_DRAFT_KEY
          : null;
      if (!key) return;
      try {
        const draft = await storage.get(key);
        if (!draft) return;
        if (!Number.isFinite(draft.createdAt) || Date.now() - draft.createdAt >= 10 * 60 * 1000) {
          await storage.set(key, null);
          status("Čakajúce predvyplnenie vypršalo; znovu ho spusti z prehľadu Vojna.", true);
          return;
        }
        if (key === ARMY_DRAFT_KEY) {
          applyArmyDraft(document, draft);
          status(`Pole „Z RA“ je predvyplnené na ${draft.amount.toLocaleString("sk-SK")}; skontroluj formulár a odošli ho ručne.`);
          log(`Vojna: predvyplnený presun ${draft.amount} univerzálov z RA; odoslanie čaká na používateľa.`);
        } else {
          applyPlanetDraft(document, draft);
          status("Formulár stavby je predvyplnený; skontroluj ho a odošli ručne.");
          log(`Vojna: predvyplnený formulár obrany planéty ${draft.planetId}; odoslanie čaká na používateľa.`);
        }
        await storage.set(key, null);
      } catch (error) {
        let message = error.message;
        try { await storage.set(key, null); }
        catch (cleanupError) {
          message += `; návrh ${key} sa nepodarilo zrušiť: ${cleanupError.message}`;
        }
        status(`Predvyplnenie sa nepodarilo: ${message}`, true);
        log(`Vojna: predvyplnenie zlyhalo: ${message}`, "error");
      }
    }

    $("#sgo-war-refresh").addEventListener("click", refresh);
    $("#sgo-war-owner").addEventListener("change", async () => {
      ownerName = $("#sgo-war-owner").value.trim();
      spies = [];
      newSpyIds = new Set();
      lastUpdated = null;
      render();
      status("Meno zmenené; obnov prehľad špionáží.");
      try { await storage.set("sgo-war-owner", ownerName); }
      catch (error) { status(`Meno sa nepodarilo uložiť: ${error.message}`, true); }
    });
    Promise.resolve(storage.get("sgo-war-owner")).then(value => {
      ownerName = typeof value === "string" ? value : "";
      $("#sgo-war-owner").value = ownerName;
      render();
    }).catch(error => status(`Nastavenie mena sa nepodarilo načítať: ${error.message}`, true));
    applyPendingDrafts();
    return { refresh, render };
  }

  const api = { ARMY_TARGET, DEFENSE_TARGET, readArmy, readPlanets, readSpies, recentSpies, applyArmyDraft, applyPlanetDraft, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOWar = api;
})(globalThis);
