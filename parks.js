(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const P = typeof module !== "undefined" && module.exports ? require("./population.js") : root.SGOPopulation;
  const KEYS = ["sdi", "bs", "parks"];
  const FIELDS = { sdi: "sdi", bs: "bs", parks: "parku" };
  const LABELS = { sdi: "SDI", bs: "BS", parks: "Parky" };
  const DEFAULTS = { sdi: { enabled: true, target: 200 }, bs: { enabled: true, target: 1000 }, parks: { enabled: false, target: 500 } };
  const SETTINGS = "sgo-dostavby-settings";
  const SNAPSHOT = "sgo-dostavby-snapshot";
  const DRAFT = "sgo-dostavby-draft";
  const PENDING = "sgo-dostavby-pending";
  const LEGACY_PENDING = "sgo-parks-pending";

  function settings(value) {
    if (!value || typeof value !== "object") throw new Error("Nastavenia dostavby nie sú platné.");
    return Object.fromEntries(KEYS.map(key => {
      const item = value[key];
      if (!item || typeof item.enabled !== "boolean" || !Number.isSafeInteger(item.target) || item.target < 0) {
        throw new Error(`Cieľ ${LABELS[key]} musí byť nezáporné celé číslo.`);
      }
      return [key, { enabled: item.enabled, target: item.target }];
    }));
  }

  function calculate(planet, config) {
    const active = KEYS.filter(key => config[key].enabled);
    for (const key of KEYS) {
      if (!Number.isSafeInteger(planet[key]) || planet[key] < 0) throw new Error(`Neplatný počet ${LABELS[key]}.`);
    }
    const matches = active.some(key => planet[key] < config[key].target);
    const missing = Object.fromEntries(KEYS.map(key => [key, config[key].enabled ? Math.max(0, config[key].target - planet[key]) : 0]));
    return { ...planet, matches, missing };
  }

  function readPlanets(doc) {
    return P.readBuildings(doc).planets.map(planet => {
      const row = doc.getElementById(`pln${planet.id}`);
      const parks = C.integer(row?.cells[6]?.textContent);
      if (parks === null || planet.built > planet.slots) throw new Error(`Nečitateľné stavby planéty ${planet.name}.`);
      return { id: planet.id, name: planet.name, sdi: planet.sdi, bs: planet.bs, parks, factories: planet.factories, freeSlots: planet.slots - planet.built };
    });
  }

  function money(text, label) {
    const value = C.clean(text).replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`Nepodarilo sa prečítať ${label}.`);
    const cents = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error(`Neplatná hodnota: ${label}.`);
    return cents;
  }
  function readBudget(doc) {
    const prices = Object.fromEntries(KEYS.map(key => [key,
      money(doc.querySelector(`[name="${FIELDS[key]}"]`)?.closest(".inf")?.querySelector("abbr")?.textContent, `cenu ${LABELS[key]}`)]));
    return { prices, balance: money(doc.querySelector(".quick-build-summary__balance abbr")?.textContent, "zostatok naquitonu"), time: Date.now() };
  }
  function budgetFor(budget, totals) {
    let cost = 0;
    for (const key of KEYS) cost += budget.prices[key] * totals[key];
    if (!Number.isSafeInteger(cost)) throw new Error("Cena dostavby je mimo podporovaného rozsahu.");
    return { cost, remaining: budget.balance - cost };
  }
  function construction(report, planet = report) {
    const total = KEYS.reduce((sum, key) => sum + report.missing[key], 0);
    if (!Number.isSafeInteger(total)) throw new Error("Počet stavieb je mimo podporovaného rozsahu.");
    const demolish = Math.max(0, total - planet.freeSlots);
    if (!Number.isSafeInteger(planet.factories) || demolish > planet.factories) throw new Error("Na uvoľnenie miesta nie je dosť výroben.");
    return { demolish, factories: planet.factories - demolish, ...Object.fromEntries(KEYS.map(key => [key, planet[key] + report.missing[key]])) };
  }
  function fill(doc, report) {
    const planet = readPlanets(doc).find(item => item.id === report.id && item.name === report.name);
    if (!planet || [...KEYS, "factories", "freeSlots"].some(key => planet[key] !== report[key])) throw new Error("Stavby planéty sa zmenili; obnov údaje.");
    if (!report.matches) throw new Error("Planéta už nespĺňa podmienky dostavby.");
    const plan = construction(report, planet);
    const form = [...doc.forms].find(item => item.querySelector('[name="parku"]') && item.querySelector('[name="postavit"]'));
    if (!form) throw new Error("Nenašiel sa stavebný formulár.");
    for (const name of ["mest", "vyroben", "sdi", "bs", "parku", "laboratori", "kasaren"]) {
      const field = form.elements.namedItem(name);
      if (!field || (field.value.trim() && field.value.trim() !== "0")) throw new Error("Formulár obsahuje rozpracované stavby; nič som neprepísal.");
    }
    const mode = form.elements.namedItem("verze");
    if (!mode || ![...mode.options].some(option => option.value === "0")) throw new Error("Chýba režim pristavovania.");
    const changes = [[form.elements.namedItem("planeta"), report.id], [mode, "0"],
      [form.elements.namedItem("vyroben"), plan.demolish ? String(-plan.demolish) : ""],
      ...KEYS.map(key => [form.elements.namedItem(FIELDS[key]), report.missing[key] ? String(report.missing[key]) : ""])];
    for (const [field, value] of changes) {
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
    container.innerHTML = `<div class="sgo-feature-heading"><span class="sgo-eyebrow">SPRÁVA PLANÉT</span><h3>Dostavby</h3>
      <p class="sgo-hint">Zobrazia sa planéty, ktorým chýba aspoň jedna zapnutá stavba.</p></div>
      <div class="sgo-parks-overview"><strong id="sgo-parks-count">Zatiaľ bez prepočtu</strong><span id="sgo-parks-goal"></span></div>
      <div class="sgo-parks-toolbar"><button type="button" id="sgo-parks-load">Obnoviť údaje</button><button type="button" id="sgo-parks-stop" disabled hidden>Zastaviť</button><button type="button" id="sgo-parks-clear-pending" hidden>Potvrdil som kontrolu</button></div>
      <details class="sgo-watch-settings"><summary>Nastavenia dostavby</summary>
      <div class="sgo-build-settings">${KEYS.map(key => `<div><label><input id="sgo-build-${key}-enabled" type="checkbox"> ${LABELS[key]}</label><input id="sgo-build-${key}-target" type="number" min="0" step="1" aria-label="Cieľ ${LABELS[key]}"></div>`).join("")}</div>
      <button type="button" id="sgo-parks-save">Uložiť nastavenia</button></details>
      <details class="sgo-watch-settings sgo-parks-help"><summary>Ako to funguje?</summary>
      <p class="sgo-hint">Stačí, aby aspoň jedna zapnutá stavba bola pod cieľom (OR). Dopĺňajú sa iba chýbajúce stavby, existujúce nad cieľom sa nerušia. Predvyplnenie potvrdíš v hre. Hromadná stavba sa odošle priamo; miesto sa podľa potreby uvoľní výrobnami. Zastavenie nevráti odoslanú stavbu.</p></details>
      <p id="sgo-parks-status" class="sgo-hint" role="status">Načítanie je ručné.</p>
      <div class="sgo-parks-selection"><button type="button" id="sgo-parks-all">Označiť všetko</button><button type="button" id="sgo-parks-none">Zrušiť výber</button><span id="sgo-parks-selected">Vybrané 0</span></div>
      <div class="sgo-parks-scroll" tabindex="0" role="region" aria-label="Dostavby planét"><div id="sgo-parks-list" role="list"></div><p id="sgo-parks-empty" class="sgo-hint">Načítaj planéty tlačidlom Obnoviť údaje.</p></div>
      <div class="sgo-parks-checkout"><p id="sgo-parks-totals">Označ planéty, ktoré chceš upraviť.</p><p id="sgo-parks-budget" class="sgo-hint" role="status"></p>
      <button type="button" id="sgo-parks-budget-refresh">Obnoviť naq</button><button type="button" id="sgo-parks-build" disabled>Postaviť označené (0)</button>
      <small>Ihneď odošle stavby aj potrebné rušenie výroben.</small></div>`;
    const $ = selector => container.querySelector(selector);
    const address = () => { const url = new URL("game.php", root.location.href); url.search = new URLSearchParams({ page: "planety" }); return url.href; };
    const onBuildings = () => { const p = new URL(root.location.href).searchParams; return p.get("page") === "planety" && !p.has("s"); };
    let config = settings(DEFAULTS), planets = [], budget = null, updatedAt = null, working = false, stopped = false;
    const selected = new Set(), prefilled = new Set();
    let pendingIssues = [];
    const message = (text, error = false) => { $("#sgo-parks-status").textContent = text; $("#sgo-parks-status").className = error ? "sgo-hint sgo-error" : "sgo-hint"; };
    const controls = () => {
      for (const id of ["load", "save", "all", "none", "build", "budget-refresh", "clear-pending"]) $(`#sgo-parks-${id}`).disabled = working;
      for (const key of KEYS) for (const field of ["enabled", "target"]) $(`#sgo-build-${key}-${field}`).disabled = working;
      $("#sgo-parks-stop").disabled = !working; $("#sgo-parks-stop").hidden = !working;
      $("#sgo-parks-clear-pending").hidden = working || !pendingIssues.length;
      $("#sgo-parks-load").textContent = working ? "Prebieha operácia…" : "Obnoviť údaje";
      container.setAttribute("aria-busy", String(working));
    };
    const persist = () => storage.set(SNAPSHOT, { planets, budget, updatedAt });
    const updateBudget = doc => {
      try { budget = readBudget(doc); }
      catch (error) { budget = null; log(`Dostavby: ${error.message}`, "error"); message(error.message, true); }
    };
    async function buildings() {
      const controller = new AbortController();
      let timer;
      try {
        return await Promise.race([getDocument(address(), { signal: controller.signal }), new Promise((resolve, reject) => {
          timer = setTimeout(() => { reject(new Error("Načítanie stavieb trvá viac ako 30 sekúnd.")); controller.abort(); }, 30000);
        })]);
      } finally { clearTimeout(timer); }
    }
    async function reconcilePending(current) {
      pendingIssues = [];
      for (const [key, legacy] of [[LEGACY_PENDING, true], [PENDING, false]]) {
        const record = await storage.get(key);
        if (!record) continue;
        const actual = current.find(planet => planet.id === record.id && planet.name === record.name);
        const fields = legacy ? ["parks", "factories"] : [...KEYS, "factories"];
        if (actual && fields.every(field => actual[field] === record[field])) {
          await storage.set(key, null);
          log(`Dostavby ${record.name}: predchádzajúca stavba overená podľa aktuálneho stavu.`);
        } else {
          pendingIssues.push({ key, legacy, record, actual });
        }
      }
      if (!pendingIssues.length) return true;
      const issue = pendingIssues[0], expected = issue.legacy ? `Parky ${issue.record.parks}, výrobne ${issue.record.factories}` :
        [...KEYS, "factories"].map(key => `${LABELS[key] || "Výrobne"} ${issue.record[key]}`).join(", ");
      message(`Neoverená stavba ${issue.record.name} (očakávané: ${expected}). Skontroluj stav planéty v hre. Záznam nemaž, ak stavbu nevieš overiť.`, true);
      return false;
    }
    const reports = () => planets.map(planet => calculate(planet, config)).filter(report => report.matches && !prefilled.has(report.id));
    function selectionLabel() {
      const chosen = reports().filter(r => selected.has(r.id) && eligible(r));
      const totals = Object.fromEntries(KEYS.map(key => [key, chosen.reduce((sum, r) => sum + r.missing[key], 0)]));
      const removed = chosen.reduce((sum, r) => sum + construction(r).demolish, 0);
      $("#sgo-parks-selected").textContent = `Vybrané ${chosen.length}`;
      $("#sgo-parks-build").textContent = `Postaviť označené (${chosen.length})`;
      $("#sgo-parks-build").disabled = working || !chosen.length;
      $("#sgo-parks-all").disabled = working || !reports().some(eligible);
      $("#sgo-parks-none").disabled = working || !chosen.length;
      $("#sgo-parks-totals").textContent = chosen.length ? `${KEYS.filter(k => totals[k]).map(k => `+${totals[k]} ${LABELS[k]}`).join(" · ")}${removed ? ` · −${removed} výroben` : " · bez búrania"}` : "Označ planéty, ktoré chceš upraviť.";
      const el = $("#sgo-parks-budget"); el.hidden = !chosen.length; el.className = "sgo-hint";
      if (!chosen.length) return;
      if (!budget) { el.textContent = "Cena alebo zostatok nie sú dostupné. Klikni na Obnoviť naq."; return; }
      try {
        const { cost, remaining } = budgetFor(budget, totals);
        const format = cents => (cents / 100).toLocaleString("sk-SK", { maximumFractionDigits: 2 });
        el.textContent = `Cena: ${format(cost)} naq · máš ${format(budget.balance)} naq. ${remaining >= 0 ? `Stačí · zostane ${format(remaining)} naq.` : `Chýba ${format(-remaining)} naq.`} Stav k ${new Date(budget.time).toLocaleTimeString("sk-SK")}; bez prípadnej náhrady za búranie.`;
        el.className = remaining >= 0 ? "sgo-hint sgo-parks-affordable" : "sgo-hint sgo-error";
      } catch (error) { el.textContent = error.message; el.className = "sgo-hint sgo-error"; }
    }
    function eligible(report) {
      try { construction(report); return true; } catch { return false; }
    }
    function render() {
      const list = $("#sgo-parks-list"); list.replaceChildren();
      const visible = reports();
      $("#sgo-parks-count").textContent = updatedAt == null ? "Zatiaľ bez prepočtu" : `Planéty na dostavbu: ${visible.length}`;
      $("#sgo-parks-goal").textContent = KEYS.filter(k => config[k].enabled).map(k => `${LABELS[k]} ${config[k].target}`).join(" · ") || "Nič nesleduješ";
      $("#sgo-parks-empty").hidden = visible.length > 0;
      $("#sgo-parks-empty").textContent = updatedAt == null ? "Načítaj planéty tlačidlom Obnoviť údaje." : "Žiadnej planéte nechýba zapnutá stavba.";
      const el = (tag, cls, text) => { const node = container.ownerDocument.createElement(tag); node.className = cls; if (text !== undefined) node.textContent = text; return node; };
      for (const report of visible) {
        const possible = eligible(report), card = el("div", "sgo-parks-card");
        card.setAttribute("role", "listitem");
        const checkbox = el("input", "sgo-parks-checkbox"); checkbox.type = "checkbox"; checkbox.disabled = working || !possible;
        checkbox.checked = possible && selected.has(report.id); checkbox.setAttribute("aria-label", `Vybrať ${report.name}`);
        card.setAttribute("data-selected", String(checkbox.checked));
        checkbox.addEventListener("change", () => { if (checkbox.checked) selected.add(report.id); else selected.delete(report.id); card.setAttribute("data-selected", String(checkbox.checked)); selectionLabel(); });
        const info = el("div", "sgo-parks-info"), title = el("div", "sgo-parks-card-title"), metrics = el("div", "sgo-parks-metrics");
        title.append(el("strong", "", report.name));
        for (const key of KEYS.filter(k => config[k].enabled)) metrics.append(el("strong", "sgo-parks-add", report.missing[key]
          ? `${LABELS[key]} ${report[key]} → ${config[key].target} (+${report.missing[key]})`
          : `${LABELS[key]} ${report[key]} (cieľ ${config[key].target} splnený)`));
        info.append(title, metrics);
        const needed = KEYS.reduce((sum, key) => sum + report.missing[key], 0);
        const demolish = Math.max(0, needed - report.freeSlots);
        info.append(el("span", demolish ? "sgo-parks-demolish" : "sgo-parks-space", !possible ? "Nedostatok výroben na uvoľnenie miesta" : demolish ? `Uvoľní miesto: −${demolish} výroben` : "Voľné miesto stačí"));
        const button = el("button", "sgo-parks-prefill", "Predvyplniť"); button.type = "button"; button.disabled = working || !possible;
        button.addEventListener("click", () => prepare(report)); card.append(checkbox, info, button); list.append(card);
      }
      selectionLabel();
    }
    async function apply(id, name, chosenConfig) {
      if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
      const current = readPlanets(container.ownerDocument);
      if (!await reconcilePending(current)) throw new Error("Predchádzajúca stavba sa nezhoduje s očakávaným stavom. Skontroluj ju alebo potvrď kontrolu po overení v hre.");
      const planet = current.find(item => item.id === id && item.name === name);
      if (!planet) throw new Error("Planéta už nemá pôvodný názov alebo ju nevlastníš.");
      if (!canEdit()) throw new Error("Začala iná operácia; nič nepredvypĺňam.");
      const report = calculate(planet, chosenConfig), plan = fill(container.ownerDocument, report);
      prefilled.add(id); revealGame();
      message(`${name}: formulár predvyplnený, rušenie ${plan.demolish} výroben. Skontroluj a potvrď stavbu v hre.`);
      log(`Dostavby ${name}: formulár predvyplnený.`);
    }
    async function prepare(report) {
      if (working) return;
      working = true; controls(); render();
      try {
        if (!await ready) throw new Error("Nastavenia sa nepodarilo načítať; obnov stránku.");
        if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
        if (onBuildings()) await apply(report.id, report.name, config);
        else {
          await persist();
          session.setItem(DRAFT, JSON.stringify({ id: report.id, name: report.name, config, time: Date.now() }));
          try { await navigate(address()); } catch (error) { session.removeItem(DRAFT); throw error; }
        }
      } catch (error) { message(error.message, true); log(`Dostavby: ${error.message}`, "error"); }
      finally { working = false; controls(); render(); }
    }
    async function load() {
      await draftsReady;
      if (working) return;
      working = true; stopped = false; controls(); message("Načítavam planéty a aktuálne stavby…");
      try {
        if (!await ready) throw new Error("Nastavenia sa nepodarilo načítať; obnov stránku.");
        if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
        const doc = await buildings();
        if (stopped) { message("Načítanie zastavené; predchádzajúci prepočet zostal zachovaný."); return; }
        const next = readPlanets(doc), pendingResolved = await reconcilePending(next);
        updateBudget(doc); planets = next; updatedAt = Date.now(); selected.clear(); prefilled.clear();
        await persist();
        if (pendingResolved) message(`Načítaných ${planets.length} planét. Filtrujem podľa nastavení.`);
        log(`Dostavby: načítaných ${planets.length} planét.`);
      } catch (error) { message(error.message, true); log(`Dostavby: ${error.message}`, "error"); }
      finally { working = false; controls(); render(); }
    }
    async function buildSelected() {
      await draftsReady;
      if (working) return;
      const queue = reports().filter(r => selected.has(r.id) && eligible(r));
      if (!queue.length) return;
      working = true; stopped = false; controls(); render();
      let completed = 0;
      try {
        if (!await ready) throw new Error("Nastavenia sa nepodarilo načítať; obnov stránku.");
        await withLock(async () => {
          for (const queued of queue) {
            if (stopped) break;
            if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
            message(`Overujem ${queued.name} (${completed + 1}/${queue.length})…`);
            const doc = await buildings(), current = readPlanets(doc); updateBudget(doc);
            if (!await reconcilePending(current)) throw new Error("Predchádzajúca stavba sa nezhoduje s očakávaným stavom. Skontroluj ju alebo potvrď kontrolu po overení v hre.");
            const planet = current.find(item => item.id === queued.id && item.name === queued.name);
            if (!planet) throw new Error(`${queued.name}: planéta už nemá pôvodný názov alebo ju nevlastníš.`);
            const report = calculate(planet, config);
            if (!report.matches) {
              planets = planets.map(p => p.id === planet.id ? planet : p); selected.delete(planet.id); updatedAt = Date.now(); await persist(); render(); continue;
            }
            const plan = fill(doc, report);
            const form = [...doc.forms].find(item => item.querySelector('[name="parku"]') && item.querySelector('[name="postavit"]'));
            const action = new URL(form.getAttribute("action") || address(), address()), expected = new URL(address());
            if (form.method.toLowerCase() !== "post" || action.origin !== expected.origin || action.pathname !== expected.pathname || action.search !== expected.search) throw new Error("Neočakávaný cieľ formulára; nič neodosielam.");
            const body = new URLSearchParams();
            for (const field of form.elements) {
              if (!field.name || field.disabled || ["submit", "button", "reset", "file"].includes(field.type) || (["checkbox", "radio"].includes(field.type) && !field.checked)) continue;
              body.append(field.name, field.value);
            }
            body.set("postavit", form.elements.namedItem("postavit").value);
            if (stopped) break;
            if (!canEdit()) throw new Error("Začala iná operácia; nič neodosielam.");
            await storage.set(PENDING, { id: planet.id, name: planet.name, ...plan, time: Date.now() });
            if (stopped) { await storage.set(PENDING, null); break; }
            message(`Staviam ${planet.name}: ${KEYS.filter(k => report.missing[k]).map(k => `+${report.missing[k]} ${LABELS[k]}`).join(", ")} · −${plan.demolish} výroben.`);
            log(`Dostavby ${planet.name}: odosielam ${KEYS.filter(k => report.missing[k]).map(k => `+${report.missing[k]} ${LABELS[k]}`).join(", ")}, −${plan.demolish} výroben.`);
            await postDocument(action.href, body);
            const verifiedDoc = await buildings(); updateBudget(verifiedDoc);
            const actual = readPlanets(verifiedDoc).find(item => item.id === planet.id && item.name === planet.name);
            if (!actual || [...KEYS, "factories"].some(key => actual[key] !== plan[key])) {
              if (actual && [...KEYS, "factories"].every(key => actual[key] === planet[key])) await storage.set(PENDING, null);
              throw new Error(`${planet.name}: stavba nebola overená. Neopakujem ju automaticky.`);
            }
            await storage.set(PENDING, null);
            planets = planets.map(p => p.id === actual.id ? actual : p); selected.delete(actual.id); updatedAt = Date.now(); await persist();
            completed++; log(`Dostavby ${planet.name}: stavba overená.`); render();
            if (!stopped && queued !== queue[queue.length - 1]) {
              const pause = delayFn(); message(`Hotovo ${completed}/${queue.length} · pauza ${(pause / 1000).toFixed(1)} s.`);
              log(`Dostavby: pauza ${(pause / 1000).toFixed(1)} s.`); await sleep(pause);
            }
          }
        });
        message(`${stopped ? "Zastavené" : "Dokončené"} · overených stavieb ${completed}/${queue.length}.`);
      } catch (error) { message(error.message, true); log(`Dostavby: ${error.message}`, "error"); }
      finally { working = false; controls(); render(); }
    }
    const ready = (async () => {
      try {
        const stored = await storage.get(SETTINGS); if (stored != null) config = settings(stored);
        for (const key of KEYS) { $(`#sgo-build-${key}-enabled`).checked = config[key].enabled; $(`#sgo-build-${key}-target`).value = String(config[key].target); }
        const snapshot = await storage.get(SNAPSHOT);
        if (snapshot != null) {
          if (!Number.isFinite(snapshot.updatedAt) || !Array.isArray(snapshot.planets) || !snapshot.planets.every(p => p && typeof p.id === "string" && /^\d+$/.test(p.id) && typeof p.name === "string" && p.name && [...KEYS, "factories", "freeSlots"].every(k => Number.isSafeInteger(p[k]) && p[k] >= 0))) throw new Error("Uložené dostavby sú poškodené; obnov údaje.");
          planets = snapshot.planets; updatedAt = snapshot.updatedAt;
          if (snapshot.budget && KEYS.every(k => Number.isSafeInteger(snapshot.budget.prices?.[k]) && snapshot.budget.prices[k] >= 0) && Number.isSafeInteger(snapshot.budget.balance) && Number.isFinite(snapshot.budget.time)) budget = snapshot.budget;
          message(`Uložené ${new Date(updatedAt).toLocaleString()} · údaje môžu byť neaktuálne.`);
        }
        render(); return true;
      } catch (error) { message(error.message, true); log(`Dostavby: ${error.message}`, "error"); render(); return false; }
    })();
    const draftsReady = ready.then(async ok => {
      if (!ok || !onBuildings()) return;
      working = true; controls();
      try {
        const current = readPlanets(container.ownerDocument);
        await reconcilePending(current);
        if (updatedAt != null) { planets = current; updatedAt = Date.now(); await persist(); }
        const draft = JSON.parse(session.getItem(DRAFT) || "null");
        if (!draft) return;
        session.removeItem(DRAFT);
        if (!Number.isFinite(draft.time) || Date.now() - draft.time >= 600000 || draft.time > Date.now()) throw new Error("Predvyplnenie vypršalo; znovu ho priprav.");
        await apply(draft.id, draft.name, settings(draft.config));
      } catch (error) { message(error.message, true); log(`Dostavby: ${error.message}`, "error"); }
      finally { working = false; controls(); render(); }
    });
    $("#sgo-parks-clear-pending").addEventListener("click", async () => {
      if (working || !pendingIssues.length) return;
      working = true; controls();
      try {
        await withLock(async () => {
          const current = readPlanets(await buildings());
          if (await reconcilePending(current)) { message("Záznam už bol overený a odstránený."); return; }
          const names = pendingIssues.map(issue => issue.record.name).join(", ");
          if (!root.confirm(`Skontroloval si v hre stav ${names}? Vymazanie záznamu pri nedokončenej stavbe môže spôsobiť jej opakovanie. Pokračovať?`)) {
            message("Záznam zostáva zachovaný; stavbu neopakujem.", true); return;
          }
          for (const issue of pendingIssues) {
            const latest = await storage.get(issue.key);
            if (!latest || latest.id !== issue.record.id || latest.name !== issue.record.name || latest.time !== issue.record.time) {
              throw new Error("Záznam sa medzitým zmenil; obnov údaje a skontroluj stav znova.");
            }
          }
          for (const issue of pendingIssues) await storage.set(issue.key, null);
          pendingIssues = [];
          message("Záznam odstránený po tvojej kontrole. Obnov údaje a až potom pokračuj.");
          log(`Dostavby: používateľ potvrdil kontrolu a odstránil neoverený záznam pre ${names}.`, "warn");
        });
      } catch (error) { message(error.message, true); log(`Dostavby: ${error.message}`, "error"); }
      finally { working = false; controls(); render(); }
    });
    $("#sgo-parks-save").addEventListener("click", async () => {
      await draftsReady; if (working) return;
      working = true; controls();
      try {
        const next = settings(Object.fromEntries(KEYS.map(key => {
          const value = $(`#sgo-build-${key}-target`).value.trim();
          if (!/^\d+$/.test(value)) throw new Error(`Cieľ ${LABELS[key]} musí byť nezáporné celé číslo.`);
          return [key, { enabled: $(`#sgo-build-${key}-enabled`).checked, target: Number(value) }];
        })));
        await storage.set(SETTINGS, next); config = next; selected.clear(); message("Nastavenia uložené; zoznam bol prepočítaný.");
      } catch (error) { message(error.message, true); log(`Dostavby: ${error.message}`, "error"); }
      finally { working = false; controls(); render(); }
    });
    $("#sgo-parks-load").addEventListener("click", load);
    $("#sgo-parks-all").addEventListener("click", () => { if (!working) { for (const r of reports().filter(eligible)) selected.add(r.id); render(); } });
    $("#sgo-parks-none").addEventListener("click", () => { if (!working) { selected.clear(); render(); } });
    $("#sgo-parks-build").addEventListener("click", buildSelected);
    $("#sgo-parks-stop").addEventListener("click", () => { stopped = true; message("Zastavujem po aktuálnej požiadavke… Už odoslanú stavbu nie je možné vrátiť."); });
    $("#sgo-parks-budget-refresh").addEventListener("click", async () => {
      await draftsReady; if (working) return; working = true; controls();
      try { message("Načítavam ceny a zostatok…"); updateBudget(await buildings()); if (budget) message("Ceny a zostatok obnovené."); if (updatedAt != null) await persist(); }
      catch (error) { budget = null; message(error.message, true); log(`Dostavby: ${error.message}`, "error"); }
      finally { working = false; controls(); render(); }
    });
    return { load, ready, draftsReady, buildSelected, get isWorking() { return working; } };
  }
  const api = { DEFAULTS, settings, calculate, readPlanets, readBudget, budgetFor, construction, fill, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOParks = api;
})(globalThis);
