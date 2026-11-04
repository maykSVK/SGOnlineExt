(async function () {
  "use strict";
  if (document.readyState === "loading") await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  if (!["/www/game.php", "/game.php"].includes(location.pathname)) return;
  if (document.getElementById("sgo-addon")) return;
  const C = globalThis.SGO;
  const RUN_KEY = "sgo-addon-run";
  const STORE_KEY = "sgo-addon-data";
  const storage = globalThis.SGOStorage.createStorage(globalThis);
  let saved;
  try {
    saved = await storage.get(STORE_KEY);
  } catch (error) {
    console.error("SGO: nastavenia sa nepodarilo nacitat", error);
    alert("SGO: nastavenia sa nepodarilo nacitat. Rozsirenie sa nespustilo.");
    return;
  }
  const data = saved || { plans: {}, logs: JSON.parse(sessionStorage.getItem("sgo-addon-log") || "[]") };
  let run = JSON.parse(sessionStorage.getItem(RUN_KEY) || "null");
  let catalog = data.catalog || [];
  let busy = false;
  let operation = 0;
  let timer;
  let watchdog;
  let writes = Promise.resolve();
  const root = document.createElement("aside");
  root.id = "sgo-addon";
  root.setAttribute("aria-label", "StarGame pomocnik");
  document.getElementById("sgo-investigation")?.remove();
  root.innerHTML = `<header>
      <div class="sgo-brand"><span class="sgo-brand-icon" aria-hidden="true">S</span><div><span class="sgo-eyebrow">VELITEĽSKÝ PANEL</span><h2>StarGame pomocník</h2></div></div>
      <button type="button" id="sgo-collapse" aria-label="Zbaliť panel" aria-expanded="true" title="Zbaliť panel">&minus;</button>
    </header>
    <div class="sgo-body">
      <nav class="sgo-navigation" aria-label="Funkcie rozšírenia"><button type="button" id="sgo-back" hidden>&larr; Všetky funkcie</button><span id="sgo-feature-name">Prehľad funkcií</span></nav>
      <section id="sgo-home">
        <section id="sgo-guardian-feature" aria-label="Denné kontroly"></section>
        <p class="sgo-hint">Vyber si pomocníka. Každá funkcia má vlastné nastavenia.</p>
        <button type="button" class="sgo-feature-card" id="sgo-open-attacks"><span class="sgo-feature-icon">01</span><span><strong>Útok na Valu</strong><small>Typy útokov, jednotky, cooldown a denník</small></span><span aria-hidden="true">&rarr;</span></button>
        <button type="button" class="sgo-feature-card" id="sgo-open-population"><span class="sgo-feature-icon">02</span><span><strong>Ideálne zaľudnenie</strong><small>Výpočet a predvyplnenie výroben na planétach</small></span><span aria-hidden="true">&rarr;</span></button>
        <button type="button" class="sgo-feature-card" id="sgo-open-sectors"><span class="sgo-feature-icon">03</span><span><strong>Naše sektory</strong><small>Náskok pred súpermi a BBCode hlásenie</small></span><span aria-hidden="true">&rarr;</span></button>
      </section>
      <section id="sgo-attacks-feature" hidden>
      <div class="sgo-target"><div><span class="sgo-eyebrow">CIEĽ MISIE <span class="sgo-target-tag">Uprchlíci</span></span><strong>Vala Mal Doran</strong></div>
        <button type="button" id="sgo-load" title="Znovu načítať limity, jednotky a planéty">Obnoviť</button>
      </div>
      <div class="sgo-status-box"><span id="sgo-state">PRIPRAVENÝ</span><div id="sgo-status" class="sgo-status" role="status"></div></div>
      <div class="sgo-actions"><button type="button" id="sgo-start">Spustiť útoky <span aria-hidden="true">&rarr;</span></button>
        <button type="button" id="sgo-stop">Zastaviť</button></div>
      <div class="sgo-tabs" role="tablist" aria-label="Sekcie pomocníka">
        <button type="button" id="sgo-attacks-tab" role="tab" aria-controls="sgo-attacks-view" aria-selected="true">Útoky <span id="sgo-selected-count">0</span></button>
        <button type="button" id="sgo-activity-tab" role="tab" aria-controls="sgo-activity-view" aria-selected="false" tabindex="-1">Denník <span id="sgo-log-count">0</span></button>
      </div>
      <section id="sgo-attacks-view" role="tabpanel" aria-labelledby="sgo-attacks-tab" class="sgo-view" tabindex="0">
        <p class="sgo-hint">Vyber typ útoku. Klik na dostupný počet nastaví <strong>všetky jednotky</strong>, vždy podľa aktuálneho stavu.</p>
        <div id="sgo-plans"></div>
      </section>
      <section id="sgo-activity-view" role="tabpanel" aria-labelledby="sgo-activity-tab" class="sgo-view" tabindex="0" hidden>
        <div class="sgo-log-toolbar"><span>Posledných 500 udalostí</span><button type="button" id="sgo-export">Exportovať log</button></div>
        <div class="sgo-log" id="sgo-log" role="log" aria-live="polite"></div>
      </section>
      </section>
      <section id="sgo-population-feature" hidden></section>
      <section id="sgo-sectors-feature" hidden></section>
      <footer class="sgo-footer"><span class="sgo-footer-dot" aria-hidden="true"></span><span id="sgo-latest">Všetko pod kontrolou. Čakám na nastavenie.</span></footer>
    </div>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.id = "sgo-launcher";
  launcher.textContent = "SGO";
  launcher.setAttribute("aria-label", "Otvoriť StarGame pomocník");
  launcher.setAttribute("aria-expanded", "false");
  root.append(launcher);
  const touchLayout = matchMedia("(pointer: coarse), (max-width: 700px)");
  let mobileOpen = false;
  function setMobileOpen(open) {
    mobileOpen = open;
    if (open) guardian?.render();
    root.classList.toggle("sgo-mobile-open", open);
    launcher.setAttribute("aria-expanded", String(open));
    if (open) $("#sgo-collapse").focus({ preventScroll: true });
    else if (root.dataset.mobile === "true") launcher.focus({ preventScroll: true });
  }
  function updateLayout() {
    const mobile = touchLayout.matches;
    root.dataset.mobile = String(mobile);
    const viewport = window.visualViewport;
    const scale = viewport?.scale || 1;
    const width = Math.min(480, (viewport?.width || innerWidth) * scale);
    root.style.setProperty("--sgo-mobile-width", `${width}px`);
    root.style.setProperty("--sgo-mobile-height", `${(viewport?.height || innerHeight) * scale}px`);
    root.style.setProperty("--sgo-mobile-scale", String(1 / scale));
    root.style.setProperty("--sgo-mobile-left", `${(viewport?.offsetLeft || 0) + (viewport?.width || innerWidth) - width / scale}px`);
    root.style.setProperty("--sgo-mobile-top", `${viewport?.offsetTop || 0}px`);
    $("#sgo-collapse").textContent = mobile ? "×" : $(".sgo-body").hidden ? "+" : "−";
    $("#sgo-collapse").setAttribute("aria-label", mobile ? "Zavrieť panel" : $(".sgo-body").hidden ? "Rozbaliť panel" : "Zbaliť panel");
    $("#sgo-collapse").title = $("#sgo-collapse").getAttribute("aria-label");
    if (mobile) $(".sgo-body").hidden = false;
    $("#sgo-collapse").setAttribute("aria-expanded", String(mobile ? mobileOpen : !$(".sgo-body").hidden));
  }
  launcher.addEventListener("click", () => { setMobileOpen(true); updateLayout(); });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && touchLayout.matches) { setMobileOpen(false); updateLayout(); }
  });
  touchLayout.addEventListener("change", updateLayout);
  window.addEventListener("resize", updateLayout);
  window.visualViewport?.addEventListener("resize", updateLayout);
  window.visualViewport?.addEventListener("scroll", updateLayout);
  updateLayout();
  function revealGame() {
    if (touchLayout.matches) { setMobileOpen(false); updateLayout(); }
  }
  let population;
  let sectors;
  let guardian;
  function showFeature(feature, save = true) {
    const selected = ["attacks", "population", "sectors"].includes(feature) ? feature : "home";
    $("#sgo-home").hidden = selected !== "home";
    $("#sgo-attacks-feature").hidden = selected !== "attacks";
    $("#sgo-population-feature").hidden = selected !== "population";
    $("#sgo-sectors-feature").hidden = selected !== "sectors";
    $("#sgo-back").hidden = selected === "home";
    $("#sgo-feature-name").textContent = { home: "Prehľad funkcií", attacks: "Útok na Valu", population: "Ideálne zaľudnenie", sectors: "Naše sektory" }[selected];
    if (selected === "home") guardian?.render();
    if (selected === "population") population?.refresh();
    if (selected === "sectors") sectors?.refresh();
    if (save) { data.feature = selected; persist(); }
  }
  function status(text, state = run?.active ? "running" : busy ? "loading" : "idle") {
    $("#sgo-status").textContent = text;
    root.dataset.state = state;
    $("#sgo-state").textContent = { running: "PREBIEHA MISIA", loading: "NAČÍTAVAM", idle: "PRIPRAVENÝ", waiting: "COOLDOWN", error: "VYŽADUJE POZORNOSŤ" }[state];
  }
  function showTab(tab, save = true) {
    for (const name of ["attacks", "activity"]) {
      const selected = name === tab;
      $(`#sgo-${name}-tab`).setAttribute("aria-selected", String(selected));
      $(`#sgo-${name}-tab`).tabIndex = selected ? 0 : -1;
      $(`#sgo-${name}-view`).hidden = !selected;
    }
    if (tab === "activity") $("#sgo-log").scrollTop = $("#sgo-log").scrollHeight;
    if (save) { data.uiTab = tab; persist(); }
  }
  function persist() {
    sessionStorage.setItem(RUN_KEY, JSON.stringify(run));
    const snapshot = JSON.parse(JSON.stringify(data));
    writes = writes.then(() => storage.set(STORE_KEY, snapshot)).catch(error => {
      clearTimeout(timer);
      if (run) run.active = false;
      sessionStorage.setItem(RUN_KEY, JSON.stringify(run));
      status(`Chyba ukladania: ${error.message}. Zastavene.`, "error");
      console.error("SGO storage", error);
    });
  }
  function log(message, level = "info") {
    data.logs.push({ time: Date.now(), level, message });
    data.logs = data.logs.slice(-500);
    drawLog();
    persist();
  }
  function drawLog() {
    const container = $("#sgo-log");
    container.replaceChildren(...data.logs.map(entry => {
      const p = document.createElement("p");
      p.dataset.level = entry.level;
      const time = document.createElement("time");
      time.textContent = new Date(entry.time).toLocaleTimeString("sk-SK");
      const badge = document.createElement("span");
      badge.className = "sgo-log-badge";
      badge.textContent = { info: "INFO", warn: "POZOR", error: "CHYBA", success: "VÝSLEDOK" }[entry.level] || entry.level;
      const message = document.createElement("span");
      message.className = "sgo-log-message";
      message.textContent = entry.message;
      p.append(time, badge, message);
      return p;
    }));
    $("#sgo-log-count").textContent = data.logs.length;
    $("#sgo-latest").textContent = data.logs.at(-1)?.message || "Žiadne udalosti. Najprv obnov dostupné útoky.";
    $("#sgo-latest").title = $("#sgo-latest").textContent;
    container.scrollTop = container.scrollHeight;
  }
  function controls() {
    $("#sgo-load").disabled = busy || Boolean(run?.active);
    $("#sgo-start").disabled = busy || Boolean(run?.active) || !catalog.length;
    $("#sgo-stop").disabled = !run?.active && !busy;
    $("#sgo-selected-count").textContent = catalog.filter(entry => data.plans[entry.id]?.enabled).length;
    $("#sgo-plans").querySelectorAll("input,select,button").forEach(e => { e.disabled = busy || Boolean(run?.active); });
    $("#sgo-plans").querySelectorAll("fieldset[data-unavailable] input").forEach(e => {
      e.disabled = busy || Boolean(run?.active) || e.type !== "checkbox" || !e.checked;
    });
  }
  function stop(message, level = "info") {
    operation++;
    clearTimeout(timer);
    clearTimeout(watchdog);
    if (run) { run.active = false; run.pending = null; }
    status(message, level === "error" ? "error" : "idle");
    log(message, level);
    controls();
  }
  function gameUrl(params) {
    const url = new URL("game.php", location.href);
    url.search = new URLSearchParams(params);
    return url.href;
  }
  async function getDocument(url) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const doc = new DOMParser().parseFromString(await response.text(), "text/html");
    if (!["/www/game.php", "/game.php"].includes(new URL(response.url).pathname) || doc.querySelector('input[type="password"]')) {
      throw new Error("Prihlasenie vyprsalo. Prihlas sa do hry.");
    }
    const result = C.response(doc);
    if (result.kind === "stop") throw new Error(result.message);
    return doc;
  }
  function drawPlans() {
    $("#sgo-plans").replaceChildren();
    const displayed = [...catalog].sort((a, b) =>
      Number(Boolean(data.plans[b.id]?.enabled)) - Number(Boolean(data.plans[a.id]?.enabled)) ||
      Number(b.available) - Number(a.available));
    for (const entry of displayed) {
      const plan = data.plans[entry.id] ||= { enabled: false, units: {}, planet: "" };
      const fieldset = document.createElement("fieldset");
      fieldset.className = "sgo-attack";
      fieldset.dataset.selected = String(plan.enabled);
      if (!entry.available || entry.remaining === 0) fieldset.dataset.unavailable = "true";
      const legend = document.createElement("legend");
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = plan.enabled;
      toggle.setAttribute("aria-label", `Vybrat ${entry.label}`);
      const body = document.createElement("div");
      body.className = "sgo-attack-body";
      body.hidden = !plan.enabled;
      toggle.addEventListener("change", () => {
        plan.enabled = toggle.checked;
        fieldset.dataset.selected = String(plan.enabled);
        body.hidden = !plan.enabled;
        persist(); controls();
      });
      const title = document.createElement("label");
      title.className = "sgo-attack-title";
      title.append(toggle, entry.label);
      const count = document.createElement("span");
      count.className = "sgo-limit";
      count.textContent = `${entry.remaining ?? "—"} / ${entry.maximum ?? "—"}`;
      count.title = "Zostávajúce útoky / limit zo stránky";
      legend.append(title, count);
      fieldset.append(legend);
      if (!entry.available) {
        const note = document.createElement("div");
        note.className = "sgo-note";
        note.textContent = entry.status.kind === "cooldown" ? "Prebieha cooldown. Po uplynutí obnov údaje." : entry.reason.slice(0, 400);
        fieldset.append(note);
      } else {
        const preview = document.createElement("div");
        preview.className = "sgo-attack-preview";
        preview.textContent = entry.fields.map(f => `${f.label} ${f.available.toLocaleString("sk-SK")}`).join(" · ");
        fieldset.append(preview, body);
        for (const field of entry.fields) {
          const row = document.createElement("div");
          row.className = "sgo-quantity";
          const unitName = document.createElement("span");
          unitName.className = "sgo-unit-name";
          unitName.textContent = field.label;
          row.append(unitName);
          const input = document.createElement("input");
          input.type = "number"; input.min = "0"; input.max = String(field.available); input.step = "1";
          input.value = plan.units[field.name] === "all" ? String(field.available) : (plan.units[field.name] || "0");
          input.setAttribute("aria-label", `${entry.label}: ${field.label}`);
          const all = document.createElement("button");
          all.type = "button";
          const showAll = () => {
            all.textContent = `${field.available.toLocaleString("sk-SK")} ks${plan.units[field.name] === "all" ? " · MAX" : " · všetky"}`;
            all.setAttribute("aria-pressed", String(plan.units[field.name] === "all"));
          };
          all.title = "Pouzit vsetky jednotky; pocet sa obnovi pred kazdym utokom";
          showAll();
          all.addEventListener("click", () => { plan.units[field.name] = "all"; input.value = field.available; showAll(); persist(); });
          input.addEventListener("input", () => { plan.units[field.name] = input.value; showAll(); persist(); });
          row.append(input, all); body.append(row);
        }
        const label = document.createElement("label");
        label.className = "sgo-planet";
        label.textContent = "Cieľová planéta";
        const select = document.createElement("select");
        select.setAttribute("aria-label", `Planeta: ${entry.label}`);
        const first = document.createElement("option"); first.value = ""; first.textContent = "Prvá aktuálne dostupná";
        select.append(first);
        for (const planet of entry.planets) {
          const option = document.createElement("option");
          option.value = planet.value; option.textContent = planet.label; select.append(option);
        }
        select.value = plan.planet;
        select.addEventListener("change", () => { plan.planet = select.value; persist(); });
        label.append(select); body.append(label);
      }
      $("#sgo-plans").append(fieldset);
    }
    persist();
    controls();
  }
  async function discover() {
    if (busy || run?.active) return;
    const ownOperation = ++operation;
    busy = true; controls(); status("Načítavam jednotky a limity zo stránky...");
    try {
      log("Nacitavam Vesmir > Uprchlici. Ziadny utok sa pri nacitani neodosiela.");
      const refugees = await getDocument(gameUrl({ page: "vesmir", jak: "98" }));
      if (ownOperation !== operation) return;
      const target = [...refugees.querySelectorAll("a")].find(a => C.clean(a.textContent) === C.TARGET);
      const row = target?.closest("tr");
      if (!row) throw new Error("Vala Mal Doran sa v zozname Uprchlici nenasla.");
      const links = [...row.querySelectorAll("a[href]")].map(a => new URL(a.getAttribute("href"), location.href))
        .filter(u => u.searchParams.has("utok") && u.searchParams.get("cil") === C.TARGET);
      if (!links.length) throw new Error("Na riadku Valy nie su odkazy na utoky.");
      const firstDoc = await getDocument(links[0].href);
      if (ownOperation !== operation) return;
      const attackLinks = [...firstDoc.querySelectorAll("a.lowopacity[href]")];
      const definitions = attackLinks.map(a => ({
        id: new URL(a.getAttribute("href"), location.href).searchParams.get("utok"),
        label: C.clean(a.firstChild.textContent),
        url: new URL(a.getAttribute("href"), location.href).href
      })).filter(a => a.id && new URL(a.url).searchParams.get("cil") === C.TARGET);
      if (!definitions.length) throw new Error("Nenasiel som typy utokov a ich limity.");
      const found = [];
      for (const definition of definitions) {
        if (ownOperation !== operation) return;
        const doc = definition.url === links[0].href ? firstDoc : await getDocument(definition.url);
        if (ownOperation !== operation) return;
        const entry = { ...C.attackPage(doc, definition.id, definition.url), label: definition.label };
        found.push(entry);
        log(`${entry.label}: ${entry.remaining ?? "?"}/${entry.maximum ?? "?"}; ${entry.available ? entry.fields.map(f => `${f.label}: ${f.available}`).join(", ") : entry.reason.slice(0, 300)}`);
      }
      catalog = found;
      data.catalog = found;
      drawPlans(); status("Údaje sú aktuálne. Vyber typy útokov a jednotky.", "idle");
    } catch (error) { if (ownOperation === operation) stop(`Nacitanie zlyhalo: ${error.message}`, "error"); }
    finally { if (ownOperation === operation || !run?.active) { busy = false; controls(); } }
  }
  function schedule(delay) {
    clearTimeout(timer);
    if (delay === undefined) {
      delay = C.pacingDelay();
      status(`Prestávka medzi krokmi: ${(delay / 1000).toFixed(1)} s.`, "waiting");
      log(`Prestávka medzi krokmi ${(delay / 1000).toFixed(1)} s.`);
    }
    timer = setTimeout(() => { tick().catch(error => stop(error.message, "error")); }, delay);
  }
  function retire(id, message) {
    run.plans[id].enabled = false;
    run.pending = null;
    run.preparing = null;
    delete run.deadlines[id];
    catalog = catalog.map(entry => entry.id === id ? {
      ...entry, remaining: 0, available: false, reason: message,
      status: { kind: "exhausted", message }
    } : entry);
    data.catalog = catalog;
    drawPlans();
    log(`${run.labels[id]}: ${message} Preskakujem tento typ, pokračujem ostatnými vybranými útokmi.`, "warn");
    schedule();
  }
  function defer(id, result) {
    run.retries[id] = (run.retries[id] || 0) + 1;
    if (run.retries[id] > 5) throw new Error("Cooldown sa opakuje bez pokroku. Seria zastavena.");
    const delay = result.delay ?? Math.min(60000, 5000 * 2 ** (run.retries[id] - 1));
    run.deadlines[id] = Date.now() + delay;
    run.pending = null;
    log(`${run.labels[id]}: cooldown, dalsi pokus najskor o ${Math.ceil(delay / 1000)} s. ${result.message.slice(0, 700)}`, "warn");
    schedule();
  }
  async function tick() {
    if (!run?.active) return;
    const activeRun = run;
    const candidates = run.order.filter(id => run.plans[id].enabled);
    if (!candidates.length) return stop("Hotovo: žiadny z vybraných typov už nemá dostupné útoky.");
    const next = C.nextAttack(run.order, run.plans, run.deadlines, run.cursor, Date.now());
    if (!next) {
      const delay = Math.max(1000, Math.min(...candidates.map(id => run.deadlines[id])) - Date.now());
      status(`Ďalší útok najskôr o ${Math.ceil(delay / 1000)} s.`, "waiting");
      return schedule(delay);
    }
    run.cursor = next.cursor;
    const id = next.id;
    const url = gameUrl({ page: "jednotky", utok: id, cil: C.TARGET });
    status(`Kontrola: ${run.labels[id]}`);
    const doc = await getDocument(url);
    if (run !== activeRun || !run.active) return;
    const entry = C.attackPage(doc, id, url);
    catalog = catalog.map(previous => previous.id === id ? { ...entry, label: previous.label } : previous);
    data.catalog = catalog;
    drawPlans();
    if (entry.remaining === null) throw new Error("Chyba citatelny limit utokov. Zastavene.");
    if (entry.remaining <= 0) {
      return retire(id, entry.status.kind === "exhausted" ? entry.status.message : "Limit útokov je vyčerpaný.");
    }
    if (entry.status.kind === "cooldown") return defer(id, entry.status);
    if (!entry.available) throw new Error(`${run.labels[id]}: formular nedostupny. ${entry.reason.slice(0, 700)}`);
    C.quantities(entry.fields, run.plans[id].units);
    run.preparing = id;
    log(`${run.labels[id]}: zostava ${entry.remaining}/${entry.maximum}. Otvaram aktualny formular.`);
    await writes;
    if (run !== activeRun || !run.active) return;
    location.assign(url);
  }
  async function submitPrepared(id, waited = false) {
    const activeRun = run;
    if (!activeRun?.active) return;
    const url = location.href;
    const params = new URL(url).searchParams;
    if (params.get("utok") !== id || params.get("cil") !== C.TARGET) throw new Error("Otvorena ina stranka nez ocakavany formular. Zastavene.");
    const entry = C.attackPage(document, id, url);
    if (entry.remaining === null) throw new Error("Nie je mozne overit limit.");
    if (entry.remaining <= 0) return retire(id, entry.status.kind === "exhausted" ? entry.status.message : "Limit útokov je vyčerpaný.");
    if (entry.status.kind === "cooldown") { run.preparing = null; return defer(id, entry.status); }
    if (!entry.available) throw new Error(`Formular nedostupny: ${entry.reason.slice(0, 700)}`);
    if (!waited) {
      const delay = C.pacingDelay("submit");
      status(`Formulár pripravený. Odoslanie o ${(delay / 1000).toFixed(1)} s.`, "waiting");
      log(`${run.labels[id]}: prestávka pred odoslaním ${(delay / 1000).toFixed(1)} s.`);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (run === activeRun && run.active) submitPrepared(id, true).catch(error => stop(error.message, "error"));
      }, delay);
      return;
    }
    run.preparing = null;
    const values = C.quantities(entry.fields, run.plans[id].units);
    const form = document.querySelector("#formular");
    const planet = form.querySelector('[name="planeta2"]');
    if (!planet || !planet.options.length) throw new Error("Ciel nema dostupnu planetu.");
    const selected = run.plans[id].planet;
    if (selected && ![...planet.options].some(o => o.value === selected)) throw new Error("Vybrana planeta uz nie je dostupna. Zvol inu.");
    if (selected) planet.value = selected;
    for (const [name, value] of Object.entries(values)) {
      const input = form.elements.namedItem(name);
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const action = new URL(form.action, url);
    if (action.origin !== location.origin || action.searchParams.get("cil") !== C.TARGET || action.searchParams.get("utok") !== id || form.method !== "post") {
      throw new Error("Formular ma neocakavany ciel alebo metodu.");
    }
    run.pending = { id, remaining: entry.remaining, sent: Date.now(), planet: planet.value };
    log(`Odosielam ${run.labels[id]} na ${planet.value}: ${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(", ")}. Limit ${entry.remaining}/${entry.maximum}.`);
    await writes;
    if (run !== activeRun || !run.active) return;
    status("Odosielam nativny formular hry...");
    // Native submission preserves the site's tokens, validation and verification.
    form.requestSubmit(form.querySelector('[name="zautocit"]'));
    watchdog = setTimeout(() => {
      stop("Formular nepresiel na vysledok. Skontroluj rucne overenie alebo chybu hry; automat nic neopakuje.", "error");
    }, 15000);
  }
  async function resume() {
    controls();
    if (!run?.active) { status("Vyber útoky alebo obnov údaje zo stránky."); return; }
    status("Pokračujem v spustenej sérii...");
    if (run.pending) {
      const pending = run.pending;
      const result = C.response(document);
      if (result.kind === "exhausted") return retire(pending.id, result.message);
      if (result.kind === "cooldown") return defer(pending.id, result);
      if (result.kind !== "result") throw new Error(`Neznamy vysledok; utok neopakujem. ${result.message.slice(0, 1600)}`);
      if (!result.text.includes(C.TARGET) || !result.message.includes(pending.planet)) throw new Error("Vysledok nezodpoveda cielu/planete. Utok neopakujem.");
      log(`${run.labels[pending.id]}: ${result.message}`, C.normalize(result.message).startsWith("vitezstvi") ? "success" : "warn");
      const unitSummary = document.querySelector("#datapl")?.parentElement;
      if (unitSummary) {
        const copy = unitSummary.cloneNode(true);
        copy.querySelectorAll("script,style").forEach(e => e.remove());
        log(`Bojovy report: ${C.clean(copy.textContent).slice(0, 4000)}`);
      }
      run.pending = null;
      run.retries[pending.id] = 0;
      run.deadlines[pending.id] = Date.now();
      persist();
    }
    if (run.preparing) return submitPrepared(run.preparing);
    schedule();
  }
  $("#sgo-load").addEventListener("click", discover);
  $("#sgo-start").addEventListener("click", () => {
    try {
      const requested = catalog.filter(e => data.plans[e.id]?.enabled);
      if (!requested.length) throw new Error("Vyber aspon jeden typ utoku.");
      const depleted = requested.filter(e => e.remaining === 0 || e.status.kind === "exhausted");
      for (const entry of depleted) log(`${entry.label}: limit je vyčerpaný, tento typ pri spustení preskakujem.`, "warn");
      const selected = requested.filter(e => !depleted.includes(e));
      if (!selected.length) return stop("Hotovo: všetky vybrané typy majú vyčerpané limity.");
      for (const entry of selected) {
        if (!entry.available || entry.remaining === null || entry.remaining <= 0) throw new Error(`${entry.label}: nedostupny alebo vycerpany.`);
        C.quantities(entry.fields, data.plans[entry.id].units);
      }
      if (!confirm(`Spustit ${selected.map(e => e.label).join(", ")} na ${C.TARGET}? Pocet utokov urcuju zostavajuce limity hry. Jednotky mozu byt stratene.`)) return;
      run = {
        active: true, plans: JSON.parse(JSON.stringify(data.plans)),
        order: selected.map(e => e.id), labels: Object.fromEntries(selected.map(e => [e.id, e.label])),
        cursor: 0, deadlines: {}, retries: {}, pending: null, preparing: null
      };
      log(`Seria spustena: ${selected.map(e => `${e.label} (${e.remaining}/${e.maximum})`).join(", ")}. Striedam vybrane typy; iny typ neodoslem.`);
      showTab("activity");
      showFeature("attacks");
      status("Seria spustena. Kontrolujem aktualne limity...");
      controls(); schedule();
    } catch (error) { stop(error.message, "error"); }
  });
  $("#sgo-stop").addEventListener("click", () => { busy = false; stop("Zastavene pouzivatelom. Uz odoslany utok nie je mozne vratit."); });
  $("#sgo-collapse").addEventListener("click", () => {
    if (touchLayout.matches) { revealGame(); return; }
    const body = $(".sgo-body"); body.hidden = !body.hidden;
    if (!body.hidden) guardian.render();
    $("#sgo-collapse").textContent = body.hidden ? "+" : "−";
    $("#sgo-collapse").setAttribute("aria-expanded", String(!body.hidden));
    $("#sgo-collapse").setAttribute("aria-label", body.hidden ? "Rozbaliť panel" : "Zbaliť panel");
    $("#sgo-collapse").title = body.hidden ? "Rozbaliť panel" : "Zbaliť panel";
  });
  for (const tab of ["attacks", "activity"]) {
    $(`#sgo-${tab}-tab`).addEventListener("click", () => showTab(tab));
    $(`#sgo-${tab}-tab`).addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "attacks" : event.key === "End" ? "activity" : tab === "attacks" ? "activity" : "attacks";
      showTab(next);
      $(`#sgo-${next}-tab`).focus();
    });
  }
  $("#sgo-back").addEventListener("click", () => showFeature("home"));
  $("#sgo-open-attacks").addEventListener("click", () => showFeature("attacks"));
  $("#sgo-open-population").addEventListener("click", () => showFeature("population"));
  population = globalThis.SGOPopulation.mount($("#sgo-population-feature"), { getDocument, log, canEdit: () => !run?.active && !busy, revealGame });
  $("#sgo-open-sectors").addEventListener("click", () => showFeature("sectors"));
  guardian = globalThis.SGOGuardian.mount($("#sgo-guardian-feature"), { getDocument, log, storage, canEdit: () => !run?.active && !busy });
  sectors = globalThis.SGOSectors.mount($("#sgo-sectors-feature"), {
    getDocument, log, canEdit: () => !run?.active && !busy, revealGame,
    navigate: async url => { await writes; location.assign(url); }
  });
  $("#sgo-export").addEventListener("click", () => {
    const blob = new Blob([data.logs.map(e => `${new Date(e.time).toISOString()} [${e.level}] ${e.message}`).join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "stargame-log.txt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  drawLog();
  if (catalog.length) drawPlans();
  showTab(data.uiTab === "activity" ? "activity" : "attacks", false);
  showFeature(run?.active ? "attacks" : data.feature, false);
  sectors.resumeForumDraft();
  resume().catch(error => stop(error.message, "error"));
})();
