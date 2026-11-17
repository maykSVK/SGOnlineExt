(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const P = typeof module !== "undefined" && module.exports ? require("./population.js") : root.SGOPopulation;
  const SETTINGS_KEY = "sgo-parks-target";
  const DRAFT_KEY = "sgo-parks-draft";
  const SNAPSHOT_KEY = "sgo-parks-snapshot";
  const PENDING_KEY = "sgo-parks-pending";

  function readBudget(doc) {
    const price = doc.querySelector('[name="parku"]')?.closest(".inf")?.querySelector("abbr")?.textContent;
    const balance = doc.querySelector('.quick-build-summary__balance abbr')?.textContent;
    const money = (text, label) => {
      const clean = C.clean(text).replace(/\s/g, "").replace(",", ".");
      if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) throw new Error(`Nepodarilo sa prečítať ${label}.`);
      const cents = Math.round(Number(clean) * 100);
      if (!Number.isSafeInteger(cents)) throw new Error(`Neplatná hodnota: ${label}.`);
      return cents;
    };
    return { price: money(price, "cenu parku"), balance: money(balance, "zostatok naquitonu"), time: Date.now() };
  }

  function budgetFor(budget, parks) {
    const cost = budget.price * parks;
    if (!Number.isSafeInteger(cost)) throw new Error("Cena označených parkov je mimo podporovaného rozsahu.");
    return { cost, remaining: budget.balance - cost };
  }

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
    container.innerHTML = `<div class="sgo-feature-heading"><span class="sgo-eyebrow">SPRÁVA PLANÉT</span><h3>Parky a spokojnosť</h3>
      <p class="sgo-hint">Doplň parky len tam, kde chýbajú.</p></div>
      <div class="sgo-parks-overview"><strong id="sgo-parks-count">Zatiaľ bez prepočtu</strong><span id="sgo-parks-goal">Cieľ 180 %</span></div>
      <div class="sgo-parks-toolbar"><button type="button" id="sgo-parks-load">Obnoviť údaje</button><button type="button" id="sgo-parks-stop" disabled hidden>Zastaviť</button></div>
      <details class="sgo-watch-settings"><summary>Nastavenia parkov</summary>
      <div class="sgo-parks-tools"><label>Cieľ spokojnosti (%)<input id="sgo-parks-target" type="number" min="0" max="200" step="0.1" value="180"></label>
      <button type="button" id="sgo-parks-save">Uložiť cieľ</button></div></details>
      <details class="sgo-watch-settings sgo-parks-help"><summary>Ako to funguje?</summary>
      <p class="sgo-hint">Predvyplniť otvorí stavebný formulár, ktorý potvrdíš sám. Hromadná stavba sa odosiela priamo. Ak chýba miesto, zruší sa len potrebný počet výroben. Medzi planétami je pauza 2,5–6 s. Zastaviť nevráti odoslanú stavbu.</p></details>
      <p id="sgo-parks-errors" class="sgo-hint" role="status"></p>
      <p id="sgo-parks-status" class="sgo-hint" role="status">Cieľ 180 % · načítanie je ručné.</p>
      <p id="sgo-parks-legacy" class="sgo-hint" hidden>Starší prepočet neobsahuje výrobne. Obnov údaje pre výber a hromadnú stavbu.</p>
      <div class="sgo-parks-selection"><button type="button" id="sgo-parks-all">Označiť všetko</button><button type="button" id="sgo-parks-none">Zrušiť výber</button><span id="sgo-parks-selected">Vybrané 0</span></div>
      <div class="sgo-parks-scroll" tabindex="0" role="region" aria-label="Parky na planétach"><div id="sgo-parks-list" role="list"></div><p id="sgo-parks-empty" class="sgo-hint">Načítaj planéty tlačidlom Obnoviť údaje.</p></div>
      <div class="sgo-parks-checkout"><p id="sgo-parks-totals">Označ planéty, ktoré chceš upraviť.</p>
      <p id="sgo-parks-budget" class="sgo-hint" role="status"></p><button type="button" id="sgo-parks-budget-refresh">Obnoviť naq</button>
      <button type="button" id="sgo-parks-build" disabled>Postaviť označené (0)</button>
      <small>Ihneď odošle stavby aj potrebné rušenie výroben.</small></div>`;
    const $ = selector => container.querySelector(selector);
    let target = 180;
    let rows = [];
    const prefilled = new Set();
    const selected = new Set();
    let updatedAt = null;
    let budget = null;
    let budgetError = "";
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
      for (const id of ["load", "save", "target", "all", "none", "build", "budget-refresh"]) $(`#sgo-parks-${id}`).disabled = working;
      $("#sgo-parks-stop").disabled = !working;
      $("#sgo-parks-stop").hidden = !working;
    };
    const detail = (planet, goal) => postDocument(url({ page: "planety", s: "detail" }),
      new URLSearchParams({ planeta: planet.id, vyberpl: "Vyber planetu" })).then(doc => readDetail(doc, planet, goal));
    const persist = () => storage.set(SNAPSHOT_KEY, { rows, updatedAt, budget });
    const updateBudget = doc => {
      try { budget = readBudget(doc); budgetError = ""; }
      catch (error) {
        budget = null; budgetError = error.message;
        log(`Parky: ${error.message}`, "error");
      }
    };
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
      $("#sgo-parks-selected").textContent = `Vybrané ${reports.length}`;
      const parks = reports.reduce((sum, report) => sum + report.missing, 0);
      const factories = reports.reduce((sum, report) => sum + Math.max(0, report.missing - report.freeSlots), 0);
      $("#sgo-parks-totals").textContent = reports.length
        ? `+${parks} parkov${factories ? ` · −${factories} výroben` : " · bez búrania"}`
        : "Označ planéty, ktoré chceš upraviť.";
      $("#sgo-parks-all").disabled = working || !selectable().length;
      $("#sgo-parks-none").disabled = working || !reports.length;
      const budgetElement = $("#sgo-parks-budget");
      budgetElement.hidden = !reports.length;
      budgetElement.className = "sgo-hint";
      if (reports.length) {
        if (!budget) {
          budgetElement.textContent = `${budgetError || "Cena a zostatok nie sú načítané."} Klikni na Obnoviť naq.`;
        } else {
          try {
            const { cost, remaining } = budgetFor(budget, parks);
            const format = cents => (cents / 100).toLocaleString("sk-SK", { maximumFractionDigits: 2 });
            budgetElement.textContent = `Cena parkov: ${format(cost)} naq · máš ${format(budget.balance)} naq. ` +
              (remaining >= 0 ? `Stačí na všetky · zostane ${format(remaining)} naq.` : `Chýba ${format(-remaining)} naq.`) +
              ` Stav k ${new Date(budget.time).toLocaleTimeString("sk-SK")}; bez prípadnej náhrady za búranie.`;
            budgetElement.className = remaining >= 0 ? "sgo-hint sgo-parks-affordable" : "sgo-hint sgo-error";
          } catch (error) {
            budgetElement.textContent = error.message;
            budgetElement.className = "sgo-hint sgo-error";
          }
        }
      }
    };

    function render() {
      const list = $("#sgo-parks-list");
      list.replaceChildren();
      $("#sgo-parks-errors").textContent = rows.filter(row => row.error).map(row => `${row.name}: ${row.error}`).join(" · ");
      $("#sgo-parks-errors").hidden = !rows.some(row => row.error);
      $("#sgo-parks-goal").textContent = `Cieľ ${target} %`;
      let visible = 0;
      let legacy = false;
      for (const row of rows) {
        if (prefilled.has(row.report?.id)) continue;
        const report = reportFor(row);
        if (!report || report.missing <= 0) continue;
        visible++;
        const element = (tag, className, text) => {
          const node = container.ownerDocument.createElement(tag);
          node.className = className;
          if (text !== undefined) node.textContent = text;
          return node;
        };
        const card = element("div", "sgo-parks-card");
        card.setAttribute("role", "listitem");
        const demolish = Math.max(0, report.missing - report.freeSlots);
        const knownFactories = Number.isSafeInteger(report.factories);
        const possible = knownFactories && report.factories >= demolish;
        legacy ||= !knownFactories;
        const checkbox = element("input", "sgo-parks-checkbox");
        checkbox.type = "checkbox";
        checkbox.setAttribute("aria-label", `Vybrať ${report.name}`);
        checkbox.checked = selected.has(report.id) && possible;
        checkbox.disabled = working || !possible;
        card.setAttribute("data-selected", String(checkbox.checked));
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.add(report.id); else selected.delete(report.id);
          card.setAttribute("data-selected", String(checkbox.checked));
          selectionLabel();
        });
        const info = element("div", "sgo-parks-info");
        const title = element("div", "sgo-parks-card-title");
        title.append(element("strong", "", row.name), element("span", "sgo-parks-happiness", `${report.happiness} %`));
        const metrics = element("div", "sgo-parks-metrics");
        metrics.append(element("strong", "sgo-parks-add", `+${report.missing} parkov`),
          element("span", "", `${report.parks} → ${report.total}`));
        info.append(title, metrics);
        info.append(element("span", demolish ? "sgo-parks-demolish" : "sgo-parks-space",
          !knownFactories ? "Výrobne neoverené" : !possible ? "Nedostatok výroben na uvoľnenie miesta" :
            demolish ? `Uvoľní miesto: −${demolish} výroben` : "Voľné miesto stačí"));
        const button = element("button", "sgo-parks-prefill", "Predvyplniť");
        button.type = "button";
        button.disabled = working || !possible;
        button.title = "Otvorí Stavění a pripraví formulár. Nič neodošle.";
        button.addEventListener("click", () => prepare(report));
        card.append(checkbox, info, button);
        list.append(card);
      }
      $("#sgo-parks-count").textContent = updatedAt == null && !rows.length ? "Zatiaľ bez prepočtu" : `Planéty pod cieľom: ${visible}`;
      $("#sgo-parks-legacy").hidden = !legacy;
      $("#sgo-parks-empty").hidden = visible > 0;
      $("#sgo-parks-empty").textContent = updatedAt == null ? "Načítaj planéty tlačidlom Obnoviť údaje." :
        prefilled.size ? "Predvyplnené. Stavbu ešte potvrď v hre." :
          rows.some(row => row.error) ? "Niektoré planéty sa nepodarilo overiť. Obnov údaje." : "Žiadne ďalšie planéty pod cieľom.";
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
            updateBudget(doc);
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
            const verifiedDoc = await getDocument(address);
            updateBudget(verifiedDoc);
            const actual = readPlanets(verifiedDoc).find(item => item.id === report.id && item.name === report.name);
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
        const doc = await getDocument(url({ page: "planety" }));
        const planets = readPlanets(doc);
        updateBudget(doc);
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
          if (snapshot.budget != null) {
            if (!["price", "balance", "time"].every(key => Number.isSafeInteger(snapshot.budget[key]) && snapshot.budget[key] >= 0)) {
              budgetError = "Uložená cena alebo zostatok sú neplatné.";
              log(`Parky: ${budgetError}`, "error");
            } else budget = snapshot.budget;
          }
          render();
          message(`Uložené ${new Date(updatedAt).toLocaleString()} · údaje môžu byť neaktuálne.`);
        }
        render();
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
        message(`Cieľ ${target} % uložený. Pre aktuálny stav obnov údaje.`);
      } catch (error) {
        message(error.message, true); log(`Parky: ${error.message}`, "error");
      } finally { working = false; controls(); render(); }
    });
    $("#sgo-parks-load").addEventListener("click", load);
    $("#sgo-parks-budget-refresh").addEventListener("click", async () => {
      await draftsReady;
      if (working) return;
      working = true; controls();
      try {
        updateBudget(await getDocument(url({ page: "planety" })));
        if (updatedAt != null) await persist();
      } catch (error) {
        budget = null; budgetError = error.message;
        log(`Parky: ${error.message}`, "error");
      } finally { working = false; controls(); selectionLabel(); }
    });
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
  const api = { targetValue, calculate, construction, readBudget, budgetFor, readPlanets, readDetail, fill, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOParks = api;
})(globalThis);
