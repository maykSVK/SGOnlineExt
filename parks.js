(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const P = typeof module !== "undefined" && module.exports ? require("./population.js") : root.SGOPopulation;
  const SETTINGS_KEY = "sgo-parks-target";
  const DRAFT_KEY = "sgo-parks-draft";
  const SNAPSHOT_KEY = "sgo-parks-snapshot";
  const PENDING_KEY = "sgo-parks-pending";

  function construction(report, planet = report) {
    const demolish = Math.max(0, report.missing - planet.freeSlots);
    if (!Number.isSafeInteger(planet.factories) || demolish > planet.factories) {
      throw new Error("Na uvoľnenie miesta nie je dosť výroben; najprv obnov prepočet.");
    }
    return { demolish, factories: planet.factories - demolish, parks: planet.parks + report.missing };
  }

  function targetValue(value) {
    const text = String(value).trim().replace(",", ".");
    if (!/^\d+(?:\.\d)?$/.test(text) || Number(text) > 200) {
      throw new Error("Cieľ spokojnosti musí byť od 0 do 200 %, najviac s jedným desatinným miestom.");
    }
    return Number(text);
  }

  function calculate(happiness, parks, target) {
    target = targetValue(target);
    if (!Number.isFinite(happiness) || happiness < 0 || happiness > 200 ||
      !Number.isSafeInteger(parks) || parks < 0) throw new Error("Neplatná spokojnosť alebo počet parkov.");
    const missing = Math.max(0, Math.ceil((Math.round(target * 100) - Math.round(happiness * 100)) / 10));
    return { happiness, parks, target, missing, total: parks + missing };
  }

  function readPlanets(doc) {
    const { planets } = P.readBuildings(doc);
    const parkInput = [...doc.forms].map(form => form.querySelector('[name="parku"]')).find(Boolean);
    const effect = parkInput?.closest(".inf")?.textContent.match(/\+\s*(\d+(?:[.,]\d+)?)\s*spokojenost/i);
    if (!effect || Number(effect[1].replace(",", ".")) !== 0.1) {
      throw new Error("Nepodarilo sa overiť účinok parku +0,1 spokojnosti.");
    }
    return planets.map(planet => {
      const parks = C.integer(doc.getElementById(`pln${planet.id}`).cells[6].textContent);
      if (parks === null || planet.built > planet.slots) throw new Error(`Nečitateľné parky alebo stavebné miesta pre ${planet.name}.`);
      return { id: planet.id, name: planet.name, parks, factories: planet.factories, freeSlots: planet.slots - planet.built };
    });
  }

  function readDetail(doc, planet, target) {
    const select = doc.querySelector('select[name="planeta"]');
    const option = select && [...select.options].find(item => item.value === planet.id);
    if (select?.value !== planet.id ||
      C.clean(option?.textContent).replace(/\s*\(DP\)$/, "") !== C.clean(planet.name).replace(/\s*\(DP\)$/, "")) {
      throw new Error("Detail nezodpovedá vybranej planéte; obnov zoznam.");
    }
    const image = doc.querySelector('img[title="Spokojenost na planetě"]');
    let text = "";
    for (let node = image?.nextSibling; node && node.nodeName !== "BR"; node = node.nextSibling) text += node.textContent;
    const match = C.clean(text).match(/^(\d+(?:[.,]\d{1,2})?)\s*%$/);
    if (!match) throw new Error("Nepodarilo sa prečítať spokojnosť z detailu planéty.");
    const label = [...doc.querySelectorAll("strong")].find(item => C.clean(item.textContent) === "Parky");
    const parks = C.integer(label?.parentElement.nextElementSibling?.textContent);
    if (parks !== planet.parks) throw new Error("Počet parkov sa od načítania stavieb zmenil; obnov zoznam.");
    return { ...planet, ...calculate(Number(match[1].replace(",", ".")), parks, target) };
  }

  function fill(doc, report) {
    const planet = readPlanets(doc).find(item => item.id === report.id && item.name === report.name);
    if (!planet || planet.parks !== report.parks) throw new Error("Planéta alebo jej parky sa na stránke zmenili; obnov Stavění.");
    if (!report.missing) throw new Error("Planéta už spĺňa nastavený cieľ; nič nepredvypĺňam.");
    const plan = construction(report, planet);
    const form = [...doc.forms].find(item => item.querySelector('[name="parku"]') &&
      item.querySelector('[name="postavit"]'));
    if (!form) throw new Error("Nenašiel sa stavebný formulár.");
    for (const name of ["mest", "vyroben", "sdi", "bs", "parku", "laboratori", "kasaren"]) {
      const field = form.elements.namedItem(name);
      if (!field || (field.value.trim() && field.value.trim() !== "0")) {
        throw new Error("Formulár obsahuje rozpracované stavby; nič som neprepísal.");
      }
    }
    const mode = form.elements.namedItem("verze");
    if (!mode || ![...mode.options].some(option => option.value === "0")) throw new Error("Chýba režim pristavovania.");
    for (const [field, value] of [[form.elements.namedItem("planeta"), report.id], [mode, "0"],
      [form.elements.namedItem("vyroben"), plan.demolish ? String(-plan.demolish) : ""],
      [form.elements.namedItem("parku"), String(report.missing)]]) {
      field.value = value;
      for (const event of ["input", "change"]) field.dispatchEvent(new (doc.defaultView || root).Event(event, { bubbles: true }));
    }
    form.scrollIntoView({ block: "center" });
    return plan;
  }

  function mount(container, { getDocument, postDocument, storage, session = root.sessionStorage,
    navigate = url => root.location.assign(url), log = () => {}, canEdit = () => true, revealGame = () => {},
    delayFn = () => C.pacingDelay(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    withLock = action => {
      if (!root.navigator?.locks) throw new Error("Hromadná stavba vyžaduje podporu Web Locks.");
      return root.navigator.locks.request("sgo-parks-build", { ifAvailable: true }, lock => {
        if (!lock) throw new Error("Hromadná stavba už beží v inej karte.");
        return action();
      });
    } }) {
    container.innerHTML = `<div class="sgo-feature-heading"><span class="sgo-eyebrow">PLANÉTY / SPOKOJNOSŤ</span><h3>Parky a spokojnosť</h3>
      <p class="sgo-hint">Minimum ďalších parkov pre zvolený cieľ. Pri nedostatku miesta sa zruší len potrebný počet výroben.</p></div>
      <details class="sgo-watch-settings"><summary>Nastavenia parkov</summary>
      <div class="sgo-parks-tools"><label>Cieľ spokojnosti (%)<input id="sgo-parks-target" type="number" min="0" max="200" step="0.1" value="180"></label>
      <button type="button" id="sgo-parks-save">Uložiť cieľ</button></div></details>
      <div class="sgo-parks-tools"><button type="button" id="sgo-parks-load">Prepočítať planéty</button><button type="button" id="sgo-parks-stop" disabled>Zastaviť</button></div>
      <div class="sgo-parks-tools"><button type="button" id="sgo-parks-all">Označiť všetko</button><button type="button" id="sgo-parks-none">Zrušiť výber</button><button type="button" id="sgo-parks-build">Postaviť označené (0)</button></div>
      <p class="sgo-hint">Len planéty pod cieľom. Predvyplnenie potvrdíš v hre; Postaviť označené ihneď odošle stavby aj potrebné rušenie výroben. Medzi planétami je pauza 2,5–6 s. Zastaviť nevráti odoslanú stavbu.</p>
      <p id="sgo-parks-errors" class="sgo-hint" role="status"></p>
      <p id="sgo-parks-status" class="sgo-hint" role="status">Cieľ 180 % · načítanie je ručné.</p>
      <div class="sgo-parks-scroll" tabindex="0" role="region" aria-label="Parky na planétach"><table class="sgo-war-table"><thead><tr><th>Planéta</th><th>Spokojnosť</th><th>Parky</th><th>Doplniť</th><th></th></tr></thead><tbody id="sgo-parks-list"></tbody></table></div>`;
    const $ = selector => container.querySelector(selector);
    let target = 180;
    let rows = [];
    const prefilled = new Set();
    const selected = new Set();
    let updatedAt = null;
    let working = false;
    let stopped = false;
    const message = (text, error = false) => {
      $("#sgo-parks-status").textContent = text;
      $("#sgo-parks-status").className = error ? "sgo-hint sgo-error" : "sgo-hint";
    };
    const url = params => {
      const address = new URL("game.php", root.location.href);
      address.search = new URLSearchParams(params);
      return address.href;
    };
    const controls = () => {
      for (const id of ["load", "save", "target", "all", "none", "build"]) $(`#sgo-parks-${id}`).disabled = working;
      $("#sgo-parks-stop").disabled = !working;
    };
    const detail = (planet, goal) => postDocument(url({ page: "planety", s: "detail" }),
      new URLSearchParams({ planeta: planet.id, vyberpl: "Vyber planetu" })).then(doc => readDetail(doc, planet, goal));
    const persist = () => storage.set(SNAPSHOT_KEY, { rows, updatedAt });
    const isBuildingPage = () => {
      const params = new URL(root.location.href).searchParams;
      return params.get("page") === "planety" && !params.has("s");
    };
    const reportFor = row => row.report && { ...row.report, ...calculate(row.report.happiness, row.report.parks, target) };
    const selectable = () => rows.map(reportFor).filter(report => report?.missing > 0 &&
      !prefilled.has(report.id) && Number.isSafeInteger(report.factories) &&
      report.factories >= Math.max(0, report.missing - report.freeSlots));
    const selectionLabel = () => {
      const reports = selectable().filter(report => selected.has(report.id));
      $("#sgo-parks-build").textContent = `Postaviť označené (${reports.length})`;
      $("#sgo-parks-build").disabled = working || !reports.length;
    };

    function render() {
      const list = $("#sgo-parks-list");
      list.replaceChildren();
      $("#sgo-parks-errors").textContent = rows.filter(row => row.error).map(row => `${row.name}: ${row.error}`).join(" · ");
      for (const row of rows) {
        if (prefilled.has(row.report?.id)) continue;
        const report = reportFor(row);
        if (!report || report.missing <= 0) continue;
        const tr = container.ownerDocument.createElement("tr");
        for (const value of [row.name, report ? `${report.happiness} %` : "Neznáme",
          report ? String(report.parks) : "?", report ? `+${report.missing} · spolu ${report.total}` : row.error]) {
          const td = container.ownerDocument.createElement("td");
          td.textContent = value;
          tr.append(td);
        }
        const cell = container.ownerDocument.createElement("td");
        if (report?.missing > 0) {
          const button = container.ownerDocument.createElement("button");
          button.type = "button";
          const demolish = Math.max(0, report.missing - report.freeSlots);
          const possible = Number.isSafeInteger(report.factories) && report.factories >= demolish;
          button.textContent = !possible ? "Obnov prepočet / chýbajú výrobne" : demolish ? `Predvyplniť (+${report.missing} P / −${demolish} V)` : "Predvyplniť";
          button.disabled = working || !possible;
          button.addEventListener("click", () => prepare(report));
          cell.append(button);
          const checkbox = container.ownerDocument.createElement("input");
          checkbox.type = "checkbox";
          checkbox.setAttribute("aria-label", `Vybrať ${report.name}`);
          checkbox.checked = selected.has(report.id);
          checkbox.disabled = working || !possible;
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) selected.add(report.id); else selected.delete(report.id);
            selectionLabel();
          });
          cell.append(checkbox);
        } else if (report) cell.textContent = "Cieľ splnený";
        tr.append(cell);
        list.append(tr);
      }
      selectionLabel();
    }

    async function apply(planetId, name, goal) {
      if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
      const pending = await storage.get(PENDING_KEY);
      if (pending?.id === planetId) throw new Error("Výsledok predchádzajúcej stavby je neistý. Najprv ho over hromadnou kontrolou; stavbu neopakujem.");
      const planet = readPlanets(container.ownerDocument).find(item => item.id === planetId && item.name === name);
      if (!planet) throw new Error("Planéta už nemá pôvodný názov alebo ju nevlastníš.");
      const report = await detail(planet, goal);
      if (!canEdit()) throw new Error("Začala iná operácia; nič nepredvypĺňam.");
      const plan = fill(container.ownerDocument, report);
      prefilled.add(planetId);
      revealGame();
      const text = `${planet.name}: predvyplnených ${report.missing} parkov a ${-plan.demolish} výroben pre cieľ ${goal} %. Skontroluj cenu a potvrď stavbu v hre.`;
      message(text);
      log(`Parky: ${text}`);
    }

    async function buildSelected() {
      await draftsReady;
      if (working) return;
      const queue = selectable().filter(report => selected.has(report.id));
      if (!queue.length) return;
      working = true; stopped = false;
      controls(); render();
      let completed = 0;
      try {
        await withLock(async () => {
          for (const queued of queue) {
            if (stopped) break;
            if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
            const address = url({ page: "planety" });
            const doc = await getDocument(address);
            const planets = readPlanets(doc);
            const pending = await storage.get(PENDING_KEY);
            if (pending) {
              const actual = planets.find(item => item.id === pending.id);
              if (!actual || actual.parks !== pending.parks || actual.factories !== pending.factories) {
                throw new Error(`Neistý výsledok stavby ${pending.name}; skontroluj ho v hre. Automaticky ju neopakujem.`);
              }
              await storage.set(PENDING_KEY, null);
              log(`Parky ${pending.name}: predchádzajúca stavba overená.`);
            }
            const planet = planets.find(item => item.id === queued.id && item.name === queued.name);
            if (!planet) throw new Error(`${queued.name}: planéta už nemá pôvodný názov alebo ju nevlastníš.`);
            const report = await detail(planet, target);
            if (!report.missing) {
              rows = rows.map(row => row.report?.id === report.id ? { name: report.name, report } : row);
              selected.delete(report.id);
              updatedAt = Date.now(); await persist(); render();
              continue;
            }
            const plan = fill(doc, report);
            const form = [...doc.forms].find(item => item.querySelector('[name="parku"]') &&
              item.querySelector('[name="postavit"]'));
            const action = new URL(form.getAttribute("action") || address, address);
            const expected = new URL(address);
            if (form.method.toLowerCase() !== "post" || action.origin !== expected.origin ||
              action.pathname !== expected.pathname || action.search !== expected.search) {
              throw new Error("Neočakávaný cieľ stavebného formulára; nič neodosielam.");
            }
            const body = new URLSearchParams();
            for (const field of form.elements) {
              if (!field.name || field.disabled || ["submit", "button", "reset", "file"].includes(field.type) ||
                (["checkbox", "radio"].includes(field.type) && !field.checked)) continue;
              body.append(field.name, field.value);
            }
            body.set("postavit", form.elements.namedItem("postavit").value);
            if (stopped) break;
            if (!canEdit()) throw new Error("Začala iná operácia; nič neodosielam.");
            await storage.set(PENDING_KEY, { id: report.id, name: report.name, ...plan, time: Date.now() });
            if (stopped) { await storage.set(PENDING_KEY, null); break; }
            message(`${report.name}: staviam +${report.missing} parkov / ruším ${plan.demolish} výroben.`);
            log(`Parky ${report.name}: odosielam +${report.missing} parkov / ${-plan.demolish} výroben.`);
            await postDocument(action.href, body);
            const actual = readPlanets(await getDocument(address)).find(item => item.id === report.id && item.name === report.name);
            if (!actual || actual.parks !== plan.parks || actual.factories !== plan.factories) {
              if (actual?.parks === planet.parks && actual.factories === planet.factories) {
                await storage.set(PENDING_KEY, null);
              }
              throw new Error(`${report.name}: stavba nebola overená (nedostatok surovín alebo iná chyba). Neopakujem ju automaticky.`);
            }
            await storage.set(PENDING_KEY, null);
            const verified = await detail(actual, target);
            rows = rows.map(row => row.report?.id === verified.id ? { name: verified.name, report: verified } : row);
            selected.delete(verified.id);
            updatedAt = Date.now(); await persist();
            completed++;
            log(`Parky ${report.name}: stavba overená, spokojnosť ${verified.happiness} %.`);
            render();
            if (!stopped && queued !== queue[queue.length - 1]) {
              const pause = delayFn();
              message(`Hotovo ${completed}/${queue.length} · pauza ${(pause / 1000).toFixed(1)} s.`);
              log(`Parky: pauza ${(pause / 1000).toFixed(1)} s.`);
              await sleep(pause);
            }
          }
        });
        message(`${stopped ? "Zastavené" : "Dokončené"} · overených stavieb ${completed}/${queue.length}.`);
        log(`Parky: ${stopped ? "zastavené" : "dokončené"}, overených ${completed}/${queue.length}.`);
      } catch (error) {
        message(error.message, true); log(`Parky: ${error.message}`, "error");
      } finally { working = false; controls(); render(); }
    }

    async function prepare(report) {
      if (working) return;
      working = true;
      controls(); render();
      try {
        if (!await ready) throw new Error("Nastavenia sa nepodarilo načítať; obnov stránku.");
        if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
        if (isBuildingPage()) {
          await apply(report.id, report.name, target);
        } else {
          await persist();
          session.setItem(DRAFT_KEY, JSON.stringify({ id: report.id, name: report.name, target, time: Date.now() }));
          try { await navigate(url({ page: "planety" })); }
          catch (error) { session.removeItem(DRAFT_KEY); throw error; }
        }
      } catch (error) {
        message(error.message, true); log(`Parky: ${error.message}`, "error");
      } finally { working = false; controls(); render(); }
    }

    async function load() {
      await draftsReady;
      if (working) return;
      working = true; stopped = false;
      controls();
      try {
        if (!await ready) throw new Error("Nastavenia sa nepodarilo načítať; obnov stránku.");
        if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
        const planets = readPlanets(await getDocument(url({ page: "planety" })));
        rows = [];
        prefilled.clear();
        let failures = 0;
        for (const planet of planets) {
          if (stopped) break;
          if (!canEdit()) throw new Error("Prepočet prerušila iná operácia.");
          message(`Čítam spokojnosť ${rows.length + 1}/${planets.length}: ${planet.name}…`);
          try { rows.push({ name: planet.name, report: await detail(planet, target) }); }
          catch (error) {
            failures++;
            rows.push({ name: planet.name, error: error.message });
            log(`Parky ${planet.name}: ${error.message}`, "error");
          }
          updatedAt = Date.now();
          await persist();
          render();
        }
        message(`${stopped ? "Zastavené" : "Prepočítané"} ${rows.length}/${planets.length} planét · cieľ ${target} % · ${failures} chýb.`, failures > 0);
        log(`Parky: načítaných ${rows.length}/${planets.length} planét, cieľ ${target} %, chyby ${failures}.`);
      } catch (error) {
        message(error.message, true); log(`Parky: ${error.message}`, "error");
      } finally { working = false; controls(); render(); }
    }

    async function restore() {
      let settingsLoaded = false;
      try {
        const saved = await storage.get(SETTINGS_KEY);
        target = targetValue(saved == null ? 180 : saved);
        $("#sgo-parks-target").value = String(target);
        settingsLoaded = true;
        message(`Cieľ ${target} % · načítanie je ručné.`);
        const snapshot = await storage.get(SNAPSHOT_KEY);
        if (snapshot != null) {
          if (!Number.isFinite(snapshot.updatedAt) || !Array.isArray(snapshot.rows) ||
            !snapshot.rows.every(row => {
              if (!row || typeof row.name !== "string" || !row.name) return false;
              if (!row.report) return typeof row.error === "string" && !!row.error;
              const report = row.report;
              return typeof report.id === "string" && /^\d+$/.test(report.id) && report.name === row.name &&
                Number.isFinite(report.happiness) && report.happiness >= 0 && report.happiness <= 200 &&
                Number.isSafeInteger(report.parks) && report.parks >= 0 &&
                Number.isSafeInteger(report.freeSlots) && report.freeSlots >= 0;
            })) throw new Error("Uložený prepočet parkov je poškodený; spusti nový prepočet.");
          rows = snapshot.rows;
          updatedAt = snapshot.updatedAt;
          render();
          message(`Uložený prepočet z ${new Date(updatedAt).toLocaleString()} · cieľ ${target} %. Údaje môžu byť neaktuálne; obnov ich ručne.`);
        }
        return true;
      } catch (error) {
        message(error.message, true); log(`Parky: ${error.message}`, "error");
        return settingsLoaded;
      }
    }
    const ready = restore();
    $("#sgo-parks-save").addEventListener("click", async () => {
      await draftsReady;
      if (working) return;
      working = true; controls();
      try {
        if (!await ready) throw new Error("Nastavenia sa nepodarilo načítať; obnov stránku.");
        const next = targetValue($("#sgo-parks-target").value);
        await storage.set(SETTINGS_KEY, next);
        target = next;
        message(`Cieľ ${target} % uložený. Už načítané údaje sú prepočítané; nové údaje načítaj tlačidlom Prepočítať planéty.`);
      } catch (error) {
        message(error.message, true); log(`Parky: ${error.message}`, "error");
      } finally { working = false; controls(); render(); }
    });
    $("#sgo-parks-load").addEventListener("click", load);
    $("#sgo-parks-all").addEventListener("click", () => {
      if (working) return;
      for (const report of selectable()) selected.add(report.id);
      render();
    });
    $("#sgo-parks-none").addEventListener("click", () => {
      if (working) return;
      selected.clear(); render();
    });
    $("#sgo-parks-build").addEventListener("click", buildSelected);
    $("#sgo-parks-stop").addEventListener("click", () => { stopped = true; });
    const draftsReady = ready.then(async ok => {
      if (!ok) return;
      if (!isBuildingPage()) return;
      working = true; controls();
      try {
        if (rows.some(row => row.report)) {
          const planets = readPlanets(container.ownerDocument);
          let changed = false;
          for (const row of [...rows]) {
            if (!row.report) continue;
            const planet = planets.find(item => item.id === row.report.id);
            if (!planet || planet.name !== row.name || planet.parks === row.report.parks) continue;
            row.report = await detail(planet, target);
            if (!row.report.missing) rows = rows.filter(item => item !== row);
            changed = true;
          }
          if (changed) { updatedAt = Date.now(); await persist(); }
        }
        const draft = JSON.parse(session.getItem(DRAFT_KEY) || "null");
        if (!draft) return;
        session.removeItem(DRAFT_KEY);
        if (!Number.isFinite(draft.time) || Date.now() - draft.time >= 600000 || draft.time > Date.now()) {
          throw new Error("Predvyplnenie parkov vypršalo; znovu ho priprav.");
        }
        await apply(draft.id, draft.name, targetValue(draft.target));
      } catch (error) {
        message(error.message, true); log(`Parky: ${error.message}`, "error");
      } finally { working = false; controls(); render(); }
    });
    return { load, ready, draftsReady, buildSelected, get isWorking() { return working; } };
  }
  const api = { targetValue, calculate, construction, readPlanets, readDetail, fill, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOParks = api;
})(globalThis);
