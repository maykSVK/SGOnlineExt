(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const W = typeof module !== "undefined" && module.exports ? require("./war.js") : root.SGOWar;
  const KEY = "sgo-war-intelligence";
  const SNAPSHOT_KEY = "sgo-war-intelligence-snapshot";
  const ATTACK_DRAFT_KEY = "sgo-war-attack-draft";
  const ATTACK_TYPES = ["1", "2", "3", "4", "5", "6", "8"];
  const ATTACK_DRAFT_HASH = "#sgo-war-attack";
  const FIELDS = [
    ["people", "Ľudia", 100], ["cities", "Mestá", 300], ["type", "Typ planéty", 500],
    ["barracks", "Kasárne", 600], ["factories", "Výrobne", 700], ["labs", "Laboratóriá", 800],
    ["sdi", "SDI", 900], ["bs", "BS", 1000], ["parks", "Parky", 1100], ["naq", "Naqiton", 1200],
    ["infantry", "Pechota", 1300], ["uni", "Univerzály", 1400], ["orbit", "Orbity", 1500],
    ["mercenaries", "Žoldnieri", 1600], ["nation", "Národnosť", 1700], ["policy", "Druhá politika", 1800]
  ];
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const fieldFor = id => FIELDS.find(field => field[0] === id);
  const validPlanetSprite = value => Number.isInteger(value) && value >= 1 && value <= 40;

  function planetSprite(image) {
    const matches = String(image?.getAttribute("class") || "").split(/\s+/)
      .map(name => /^pln-80-(\d+)$/.exec(name)).filter(Boolean);
    if (matches.length !== 1) return null;
    const sprite = Number(matches[0][1]);
    return validPlanetSprite(sprite) ? sprite : null;
  }

  function readState(value) {
    if (value == null) return { pending: null, reports: [] };
    if (!value || !Array.isArray(value.reports) || value.reports.length > 300 ||
      !(value.pending === null || (value.pending && ["owner", "target", "planet", "field"].every(k => typeof value.pending[k] === "string" && value.pending[k]) &&
        fieldFor(value.pending.field) && Number.isFinite(value.pending.time))) ||
      !value.reports.every(r => r && ["owner", "target", "planet", "field", "outcome", "label", "value"].every(k => typeof r[k] === "string") &&
        r.owner && r.target && r.planet && fieldFor(r.field) && ["success", "failure"].includes(r.outcome) &&
        Number.isFinite(r.time) && Number.isSafeInteger(r.losses) && r.losses >= 0 &&
        (r.planetSprite === undefined || (r.field === "type" && r.outcome === "success" && validPlanetSprite(r.planetSprite))))) {
      throw new Error("Uložené údaje prieskumu sú neplatné; odoslanie nie je bezpečné.");
    }

    return { pending: value.pending && { ...value.pending }, reports: value.reports.map(r => ({ ...r })) };
  }

  function readSnapshot(value) {
    if (value == null) return null;
    if (!value || !["owner", "target", "planet", "field", "attackType"].every(key => typeof value[key] === "string") ||
      !value.owner || !value.target || !fieldFor(value.field) || !["1", "2", "3", "4", "5", "6", "8"].includes(value.attackType) ||
      !Number.isFinite(value.time) || !Number.isFinite(value.planetsTime) || !Array.isArray(value.planets) ||
      !value.planets.every(item => item && typeof item.value === "string" && typeof item.label === "string") ||
      (value.planet && !value.planets.some(item => item.value === value.planet)) ||
      !Array.isArray(value.units) || !value.units.every(item => typeof item === "string") ||
      !Array.isArray(value.recent) || !value.recent.every(item => item &&
        ["meta", "direction", "result"].every(key => typeof item[key] === "string") &&
        Array.isArray(item.rows) && item.rows.every(row => typeof row === "string"))) {
      throw new Error("Uložený prehľad hráča je neplatný.");
    }

    return value;
  }

  function applyAttackDraft(doc, address, draft, initialValue) {
    const current = new URL(address);
    if (!draft || !["owner", "target", "planet", "type"].every(key => typeof draft[key] === "string" && draft[key]) ||
      !ATTACK_TYPES.includes(draft.type) || !Number.isFinite(draft.createdAt) ||
      Date.now() - draft.createdAt < 0 || Date.now() - draft.createdAt >= 10 * 60 * 1000 ||
      current.searchParams.get("page") !== "jednotky" || current.searchParams.get("utok") !== draft.type ||
      current.searchParams.get("cil") !== draft.target || current.hash !== ATTACK_DRAFT_HASH) {
      throw new Error("Predvyplnenie je neplatné, vypršalo alebo nepatrí k otvorenému útoku.");
    }
    const form = doc.querySelector("#formular");
    const selector = form?.querySelector('[name="planeta2"]');
    const action = form && new URL(form.getAttribute("action") || address, address);
    if (!form || form.method.toLowerCase() !== "post" || !selector ||
      clean(doc.querySelector("#nepritele")?.textContent) !== draft.target ||
      action.origin !== current.origin || action.pathname !== current.pathname ||
      action.searchParams.get("page") !== "jednotky" || action.searchParams.get("utok") !== draft.type ||
      action.searchParams.get("cil") !== draft.target) {
      throw new Error("Herný formulár nepotvrdzuje zvolený útok a hráča.");
    }
    if (selector.value !== initialValue) throw new Error("Výber planéty sa medzitým zmenil; nič som neprepísal.");
    if (![...selector.options].some(option => option.value === draft.planet && !option.disabled)) {
      throw new Error("Vybraná planéta už nie je v aktuálnom formulári útoku.");
    }
    selector.value = draft.planet;
    selector.dispatchEvent(new Event("input", { bubbles: true }));
    selector.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function spyForm(doc, url, target, planet, field) {
    const info = fieldFor(field);
    if (!info) throw new Error("Vyber platnú informáciu na zistenie.");
    const entry = C.attackPage(doc, "7", url, target);
    if (!entry.available) {
      throw new Error(entry.status.kind === "cooldown" ? `Cooldown: ${entry.status.message}` :
        `Špionáž nie je dostupná: ${entry.reason.slice(0, 250)}`);
    }
    if (entry.remaining === null || entry.remaining <= 0) throw new Error("Nie je dostupný špionážny útok alebo sa nedá overiť limit.");
    if (!entry.planets.some(item => item.value === planet)) throw new Error("Planéta nie je v aktuálnom zozname cieľa.");
    const unit = entry.fields.find(item => item.name === "pocet_druzic");
    if (!unit || unit.available < info[2]) throw new Error(`Chýbajú sondy: potrebných ${info[2]}, dostupných ${unit?.available ?? "?"}.`);
    const form = doc.querySelector("#formular");
    if (form.method.toLowerCase() !== "post") throw new Error("Nerozpoznaný spôsob odoslania špionáže.");
    const action = new URL(form.getAttribute("action") || url, url);
    const expected = new URL(url);
    if (action.origin !== expected.origin || action.pathname !== expected.pathname ||
      action.searchParams.get("page") !== "jednotky" || action.searchParams.get("utok") !== "7" ||
      action.searchParams.get("cil") !== target) throw new Error("Nerozpoznaná adresa formulára špionáže.");
    const body = new URLSearchParams();
    for (const element of form.elements) {
      if (element.name && !element.disabled && element.type === "hidden") body.append(element.name, element.value);
    }
    body.set("planeta2", planet);
    body.set("pocet_druzic", String(info[2]));
    body.set("zautocit", form.elements.namedItem("zautocit").value);
    return { action: action.href, body, entry };
  }

  function readResult(doc, request) {
    const outcome = C.normalize(clean(doc.querySelector("#datapl h2")?.textContent));
    if (!/^(vitezstvi|porazka|prohra)/.test(outcome)) throw new Error("Hra nevrátila rozpoznaný výsledok špionáže.");
    const result = doc.querySelector("#datapl");
    if (!clean(result.textContent).includes(request.planet) ||
      clean(doc.querySelector("#obranj > .n")?.textContent) !== request.target) {
      throw new Error("Výsledok nepotvrdzuje vybraného hráča a planétu.");
    }
    const unit = [...doc.querySelectorAll("#nasej tr")].find(row => C.normalize(row.textContent).includes("sonda"));
    const sent = C.integer(unit?.querySelector(".g")?.textContent || "");
    const losses = C.integer(unit?.querySelector(".w")?.textContent || "");
    if (sent !== fieldFor(request.field)[2] || losses === null || losses > sent) {
      throw new Error("Počet vyslaných sond alebo straty sa nepodarilo overiť.");
    }
    const success = outcome.startsWith("vitezstvi");
    const row = doc.querySelector("#obranj tr");
    const label = clean(row?.querySelector("strong")?.textContent);
    const green = row ? [...row.querySelectorAll(".g")] : [];
    const value = clean(row?.querySelector(".w")?.textContent ||
      (green.length === 2 && C.normalize(clean(green[0].textContent)) === "zjisteno" ? green[1].textContent : ""));
    if (success && (!label || !value || value === "???")) throw new Error("Hra nepotvrdila zistenú hodnotu.");
    const sprite = success && request.field === "type" ? planetSprite(row?.querySelector("img")) : null;
    return { ...request, outcome: success ? "success" : "failure", label: success ? label : "", value: success ? value : "", losses,
      ...(sprite === null ? {} : { planetSprite: sprite }) };
  }

  function readRecent(doc, target) {
    return [...doc.querySelectorAll(".recon-report")].filter(report => {
      const link = report.querySelector(".recon-report-target a[href]");
      if (!link) return false;
      return new URL(link.getAttribute("href"), "https://stargame-online.cz/game.php").searchParams.get("hledat") === target;
    }).map(report => ({
      meta: clean(report.querySelector(".recon-report-meta")?.textContent),
      direction: clean(report.querySelector(".recon-report-target")?.textContent),
      result: clean(report.querySelector(".summary")?.textContent),
      rows: [...report.querySelectorAll("table.stats tr")].slice(1).map(row => clean(row.textContent))
    }));
  }

  function readSpyReports(doc, owner, target) {
    const reports = [];
    for (const element of doc.querySelectorAll(".recon-report")) {
      const link = element.querySelector(".recon-report-target a[href]");
      if (!link || link.getAttribute("data-utocnik") !== owner ||
        new URL(link.getAttribute("href"), "https://stargame-online.cz/game.php").searchParams.get("hledat") !== target) continue;
      const summary = element.querySelector(".summary");
      if (!/spionazni utok/.test(C.normalize(summary?.textContent || "")) ||
        !/zjistili jsme informace/.test(C.normalize(summary?.textContent || ""))) continue;
      const planet = clean(summary.textContent).match(/„([^“]+)“/)?.[1];
      const date = clean(element.querySelector(".recon-report-meta")?.textContent)
        .match(/#(\d+)\s*»\s*(\d{2}):(\d{2}):(\d{2}),\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      const rows = element.querySelectorAll("table.stats tr");
      if (!planet || !date || rows.length < 5) continue;
      const names = rows[1].querySelectorAll(".nj");
      const before = rows[3].querySelectorAll(".zj");
      const after = rows[4].querySelectorAll(".zj");
      const count = C.integer(clean(before[0]?.textContent));
      const field = FIELDS.find(item => item[2] === count || (item[0] === "people" && count === 200) || (item[0] === "cities" && count === 400));
      const losses = C.integer(clean(after[0]?.textContent));
      const label = clean(names[1]?.textContent);
      const value = clean(after[1]?.textContent);
      if (!field || losses === null || losses > count || !label || !value || value === "???") continue;
      const time = W.gameTimestamp(Number(date[7]), Number(date[6]), Number(date[5]), Number(date[2]), Number(date[3]), Number(date[4]));
      const sprite = field[0] === "type" ? planetSprite(rows[0].querySelectorAll("td")[2]?.querySelector("img")) : null;
      reports.push({ owner, target, planet, field: field[0], time, outcome: "success", label, value, losses, reportId: date[1],
        ...(sprite === null ? {} : { planetSprite: sprite }) });
    }
    return reports;
  }

  function mergeReports(saved, imported) {
    const reports = saved.map(report => ({ ...report }));
    let changed = false;
    for (const item of imported) {
      const existing = reports.find(report => report.reportId === item.reportId ||
        (report.owner === item.owner && report.target === item.target && report.planet === item.planet &&
          report.field === item.field && report.value === item.value && Math.abs(report.time - item.time) < 60000));
      if (!existing) { reports.push(item); changed = true; }
      else if (item.planetSprite !== undefined && existing.planetSprite === undefined &&
        existing.owner === item.owner && existing.target === item.target && existing.planet === item.planet &&
        existing.field === item.field && existing.value === item.value && existing.outcome === "success") {
        existing.planetSprite = item.planetSprite; changed = true;
      }
    }
    return { reports: reports.sort((a, b) => a.time - b.time).slice(-300), changed };
  }

  function readUnits(doc) {
    return [...doc.querySelectorAll(".sb")].filter(el => /pěchota|univerzál|orbit|žoldnéř/i.test(el.querySelector(".n")?.textContent || ""))
      .map(el => {
        const stat = title => {
          const icon = el.querySelector(`img[alt="${title}"]`);
          if (!icon) return "";
          let text = "";
          for (let node = icon.nextSibling; node && node.nodeName !== "BR"; node = node.nextSibling) text += node.textContent;
          return clean(text);
        };
        const name = clean(el.querySelector(".n")?.textContent);
        const attack = stat("Útok");
        const defense = stat("Obrana");
        const amount = clean(el.textContent).match(/Máme:\s*([\d\s]+?)(?:\s*\+|\s*ks)/)?.[1];
        if (!attack && !defense) return `${name} · ${clean(el.textContent).replace(name, "").trim()}`;
        return [name, attack && `Útok ${attack}`, defense && `Obrana ${defense}`, amount && `Máme ${clean(amount)}`].filter(Boolean).join(" · ");
      }).slice(0, 4);
  }

  function mount(container, { getDocument, postDocument, storage, log, canEdit, navigate, revealGame }) {
    container.innerHTML = `<div class="sgo-war-intel">
      <div class="sgo-feature-heading"><span class="sgo-eyebrow">VOJNOVÝ PREHĽAD</span><h3>Útočný prieskum</h3>
        <p class="sgo-hint">Vyber hráča, planétu a informáciu. Jedno kliknutie odošle jednu špionáž; sondy môžu padnúť.</p></div>
      <div class="sgo-intel-search"><label for="sgo-intel-target">CIEĽ PRIESKUMU</label><div><input id="sgo-intel-target" type="text" placeholder="Presné meno hráča" autocomplete="off"><button type="button" id="sgo-intel-load">Načítať</button></div>
        <p class="sgo-intel-status" id="sgo-intel-status" role="status">Zadaj meno hráča a načítaj jeho planéty.</p></div>
      <section class="sgo-war-card sgo-war-card-mission"><strong>Špionáž planéty</strong>
        <label class="sgo-intel-label">Planéta<select id="sgo-intel-planet" aria-label="Planéta"></select></label>
        <label class="sgo-intel-label">Čo zistiť<select id="sgo-intel-field" aria-label="Informácia"></select></label>
        <p class="sgo-note" id="sgo-intel-cost"></p>
        <button type="button" class="sgo-intel-send" id="sgo-intel-send">Odoslať špionáž</button>
        <div id="sgo-intel-pending" hidden><p class="sgo-error" id="sgo-intel-pending-message"></p>
          <button type="button" id="sgo-intel-recon">Otvoriť Rozviedku</button>
          <button type="button" id="sgo-intel-clear">Skontroloval som výsledok</button></div>
      </section>
      <section class="sgo-war-card sgo-war-card-findings"><strong>Zistenia pre planétu</strong><div id="sgo-intel-planet-overview"></div>
        <div id="sgo-intel-planet-attack" hidden>
          <label class="sgo-intel-label">Typ útoku<select id="sgo-intel-attack-type" aria-label="Typ útoku">
            <option value="1">Dobývací</option><option value="2">Partizánsky</option><option value="5">Univerzálny</option><option value="4">Orbitálny</option><option value="8">ZHN</option><option value="6">Otrokársky</option><option value="3">Zlodejský</option>
          </select></label>
          <button type="button" id="sgo-intel-prepare-planet">Pripraviť útok na planétu</button>
          <p class="sgo-note">Otvorí formulár s vybranou planétou. Jednotky a odoslanie sú na tebe.</p>
        </div>
        <p class="sgo-note">Vlastné špionáže z aktuálnej stránky Rozviedky a odoslania z doplnku. Staré údaje môžu byť neaktuálne; neznáme nie je nula.</p><div id="sgo-intel-findings"></div></section>
      <section class="sgo-war-card"><strong>Moje jednotky</strong><p class="sgo-note">Hodnoty zo stránky Jednotky. Nejde o potvrdený výpočet výsledku boja.</p><div id="sgo-intel-units"></div></section>
      <section class="sgo-war-card"><strong>Posledné reporty s hráčom</strong><p class="sgo-note">Len reporty z aktuálnej stránky Rozviedky, v oboch smeroch; ??? je neznáma hodnota.</p><div id="sgo-intel-reports"></div></section>
      <p class="sgo-note">Zatiaľ nevypočítavame potrebný počet jednotiek: bonusy súpera a presný bojový vzorec nie sú potvrdené.</p>
    </div>`;
    const $ = selector => container.querySelector(selector);
    const url = params => { const result = new URL("game.php", root.location.href); result.search = new URLSearchParams(params); return result.href; };
    const spyUrl = target => url({ page: "jednotky", utok: "7", cil: target });
    const reconUrl = () => url({ page: "jednotky", akce: "rozvedka" });
    let owner = "", target = "", planets = [], state = { pending: null, reports: [] }, busy = false, ready = false;
    let recent = [], units = [], snapshot = null, snapshotWrites = Promise.resolve();
    const select = $("#sgo-intel-field");
    for (const [id, label, count] of FIELDS) {
      const option = container.ownerDocument.createElement("option");
      option.value = id; option.textContent = `${label} · ${count} sond`; select.append(option);
    }
    const status = (text, error = false) => {
      $("#sgo-intel-status").textContent = text;
      $("#sgo-intel-status").classList.toggle("sgo-error", error);
    };
    function populatePlanets(selected) {
      const planet = $("#sgo-intel-planet"); planet.replaceChildren();
      for (const item of planets) {
        const option = container.ownerDocument.createElement("option"); option.value = item.value; option.textContent = item.label; planet.append(option);
      }
      if (planets.some(item => item.value === selected)) planet.value = selected;
    }
    function saveSelection() {
      if (!snapshot || !target || snapshot.target !== target || snapshot.owner !== owner) return;
      snapshot = { ...snapshot, planet: $("#sgo-intel-planet").value, field: select.value, attackType: $("#sgo-intel-attack-type").value };
      const value = snapshot;
      snapshotWrites = snapshotWrites.then(() => storage.set(SNAPSHOT_KEY, value)).catch(error => {
        status(`Výber sa nepodarilo uložiť: ${error.message}`, true);
        log(`Vojnový prieskum: výber sa nepodarilo uložiť: ${error.message}`, "error");
      });
    }
    function render() {
      const info = fieldFor(select.value);
      $("#sgo-intel-cost").textContent = info ? `${info[2]} sond · úspech nie je zaručený; neúspešný pokus môže sondy zničiť.` : "Vyber informáciu.";
      $("#sgo-intel-send").disabled = busy || !ready || !target || !$("#sgo-intel-planet").value || !info || Boolean(state.pending);
      $("#sgo-intel-load").disabled = busy || !ready;
      $("#sgo-intel-target").disabled = busy || !ready;
      $("#sgo-intel-planet").disabled = busy;
      $("#sgo-intel-field").disabled = busy;
      $("#sgo-intel-planet-attack").hidden = !target || !$("#sgo-intel-planet").value;
      $("#sgo-intel-prepare-planet").disabled = busy || !ready || !target || !$("#sgo-intel-planet").value;
      $("#sgo-intel-pending").hidden = !state.pending;
      if (state.pending) {
        const pending = state.pending;
        $("#sgo-intel-pending-message").textContent = `Neistý výsledok: ${pending.owner} → ${pending.target}, ${pending.planet}, ${fieldFor(pending.field)[1]} · ${new Date(pending.time).toLocaleString("sk-SK")}. Skontroluj Rozviedku; útok sa sám neopakuje.`;
      }
      const findings = $("#sgo-intel-findings");
      findings.replaceChildren();
      const latest = new Map();
      for (const report of [...state.reports].sort((a, b) => a.time - b.time)) {
        if (report.owner === owner && report.target === target && report.planet === $("#sgo-intel-planet").value && report.outcome === "success") latest.set(report.field, report);
      }
      const overview = $("#sgo-intel-planet-overview");
      overview.replaceChildren();
      const selectedPlanet = $("#sgo-intel-planet").value;
      if (target && selectedPlanet) {
        const type = latest.get("type");
        const card = container.ownerDocument.createElement("div"); card.className = "sgo-intel-planet-overview";
        const image = container.ownerDocument.createElement("span");
        if (type && validPlanetSprite(type.planetSprite)) {
          image.className = "sgo-intel-planet-image";
          image.style.backgroundPosition = `0 -${(type.planetSprite - 1) * 80}px`;
          image.setAttribute("role", "img"); image.setAttribute("aria-label", `Typ planéty: ${type.value}`);
        } else {
          image.className = "sgo-intel-planet-placeholder";
          image.textContent = "?"; image.setAttribute("aria-hidden", "true");
        }
        const details = container.ownerDocument.createElement("div"); details.className = "sgo-intel-planet-details";
        const caption = container.ownerDocument.createElement("span"); caption.className = "sgo-intel-planet-caption"; caption.textContent = "PLANÉTA HRÁČA";
        const name = container.ownerDocument.createElement("strong"); name.textContent = selectedPlanet;
        const player = container.ownerDocument.createElement("span"); player.className = "sgo-intel-planet-player"; player.textContent = `Hráč: ${target}`;
        const kind = container.ownerDocument.createElement("span"); kind.className = "sgo-intel-planet-type";
        kind.textContent = type ? `Typ: ${type.value}` : "Typ planéty zatiaľ neznámy";
        details.append(caption, name, player, kind);
        if (type) {
          const date = container.ownerDocument.createElement("span"); date.className = "sgo-intel-planet-date";
          date.textContent = `Zistené: ${new Date(type.time).toLocaleString("sk-SK")}`;
          details.append(date);
          if (!validPlanetSprite(type.planetSprite)) {
            const note = container.ownerDocument.createElement("span"); note.className = "sgo-intel-planet-date";
            note.textContent = "Obrázok nie je uložený. Načítaj hráča znova, ak je report ešte v Rozviedke.";
            details.append(note);
          }
        }
        card.append(image, details); overview.append(card);
      }
      if (!latest.size) {
        const note = container.ownerDocument.createElement("p"); note.className = "sgo-note"; note.textContent = "Zatiaľ nemáme uložené úspešné zistenia pre túto planétu."; findings.append(note);
      }
      for (const report of latest.values()) {
        if (report.field === "type") continue;
        const line = container.ownerDocument.createElement("div"); line.className = "sgo-intel-finding";
        const content = container.ownerDocument.createElement("div"); content.className = "sgo-intel-finding-content";
        const title = container.ownerDocument.createElement("strong"); title.textContent = `${fieldFor(report.field)[1]} · ${report.label}: ${report.value}`;
        const date = container.ownerDocument.createElement("span"); date.textContent = new Date(report.time).toLocaleString("sk-SK");
        content.append(title, date); line.append(content); findings.append(line);
      }
      const unitList = $("#sgo-intel-units"); unitList.replaceChildren();
      for (const text of units) { const item = container.ownerDocument.createElement("p"); item.textContent = text; unitList.append(item); }
      if (!units.length) { const item = container.ownerDocument.createElement("p"); item.className = "sgo-note"; item.textContent = "Načítaj hráča pre aktuálne hodnoty."; unitList.append(item); }
      const list = $("#sgo-intel-reports"); list.replaceChildren();
      for (const report of recent) {
        const item = container.ownerDocument.createElement("div"); item.className = "sgo-intel-report";
        const heading = container.ownerDocument.createElement("strong"); heading.textContent = `${report.meta} · ${report.direction}`;
        const result = container.ownerDocument.createElement("span"); result.textContent = report.result;
        const detail = container.ownerDocument.createElement("small"); detail.textContent = report.rows.join(" · ");
        item.append(heading, result, detail); list.append(item);
      }
      if (!recent.length) { const item = container.ownerDocument.createElement("p"); item.className = "sgo-note"; item.textContent = "Na aktuálnej stránke Rozviedky nie sú reporty pre tohto hráča."; list.append(item); }
    }
    async function load() {
      if (busy) return;
      await initialized;
      if (busy || !ready) return;
      const name = clean($("#sgo-intel-target").value);
      if (!name) { status("Zadaj presné meno hráča.", true); return; }
      if (!canEdit()) { status("Najprv počkaj na dokončenie prebiehajúcej operácie.", true); return; }
      busy = true; render(); status("Načítavam hráča a prehľad…");
      try {
        const currentOwner = W.readOwner(await getDocument(url({ page: "prehled" })));
        const doc = await getDocument(spyUrl(name));
        const entry = C.attackPage(doc, "7", spyUrl(name), name);
        if (entry.available && entry.target !== name) throw new Error("Hra nepotvrdila vybraného hráča.");
        const reportDoc = await getDocument(reconUrl());
        const unitDoc = await getDocument(url({ page: "jednotky", akce: "jednotky" }));
        const nextUnits = readUnits(unitDoc);
        if (!nextUnits.length) throw new Error("Nepodarilo sa prečítať vlastné jednotky.");
        let saved;
        const imported = readSpyReports(reportDoc, currentOwner, name);
        await W.withRenameLock(async () => {
          saved = readState(await storage.get(KEY));
          const merged = mergeReports(saved.reports, imported);
          if (merged.changed) {
            saved = { ...saved, reports: merged.reports };
            await storage.set(KEY, saved);
          }
        });
        const previous = snapshot?.owner === currentOwner && snapshot.target === name ? snapshot : null;
        const nextPlanets = entry.planets.length ? entry.planets : previous?.planets || [];
        const next = {
          owner: currentOwner, target: name, planets: nextPlanets,
          planet: nextPlanets.some(item => item.value === previous?.planet) ? previous.planet : nextPlanets[0]?.value || "",
          field: select.value, attackType: $("#sgo-intel-attack-type").value,
          recent: readRecent(reportDoc, name), units: nextUnits, time: Date.now(),
          planetsTime: entry.planets.length ? Date.now() : previous?.planetsTime || Date.now()
        };
        await snapshotWrites;
        await storage.set(SNAPSHOT_KEY, next);
        snapshot = next; owner = currentOwner; target = name; planets = next.planets; state = saved;
        recent = next.recent; units = next.units;
        populatePlanets(next.planet);
        status(entry.available
          ? `${target} · ${planets.length} planét · sondy ${entry.fields.find(f => f.name === "pocet_druzic").available} · špionáže ${entry.remaining ?? "?"}/${entry.maximum ?? "?"}.`
          : `Prehľad načítaný, ale špionáž teraz nie je dostupná: ${entry.status.kind === "cooldown" ? entry.status.message : entry.reason.slice(0, 250)}${previous && !entry.planets.length ? " Zoznam planét je zo staršieho načítania." : ""}`, !entry.available);
      } catch (error) {
        status(`Načítanie zlyhalo: ${error.message}`, true); log(`Vojnový prieskum: ${error.message}`, "error");
      } finally { busy = false; render(); }
    }
    async function send() {
      if (busy || !ready || !target || state.pending) return;
      const request = { owner, target, planet: $("#sgo-intel-planet").value, field: select.value, time: Date.now() };
      if (!request.planet || !fieldFor(request.field)) { status("Vyber planétu a informáciu.", true); return; }
      if (!canEdit()) { status("Najprv počkaj na dokončenie prebiehajúcej operácie.", true); return; }
      busy = true; render();
      let sent = false;
      try {
        await W.withRenameLock(async () => {
          const saved = readState(await storage.get(KEY));
          state = saved;
          if (state.pending) throw new Error("Predchádzajúca špionáž má neistý výsledok; skontroluj Rozviedku.");
          const actualOwner = W.readOwner(await getDocument(url({ page: "prehled" })));
          if (actualOwner !== owner) throw new Error("Prihlásený hráč sa zmenil; načítaj cieľ znova.");
          const address = spyUrl(request.target);
          const payload = spyForm(await getDocument(address), address, request.target, request.planet, request.field);
          if (!canEdit()) throw new Error("Začala iná operácia; špionáž nebola odoslaná.");
          const next = { ...state, pending: request };
          await storage.set(KEY, next);
          state = next;
          status(`Odosielam ${fieldFor(request.field)[2]} sond na ${request.planet}…`);
          log(`Vojnový prieskum: odosielam ${fieldFor(request.field)[2]} sond na ${request.target}/${request.planet} · ${fieldFor(request.field)[1]}.`);
          sent = true;
          const response = await postDocument(payload.action, payload.body);
          const responseStatus = C.response(response);
          if (responseStatus.kind === "cooldown" || responseStatus.kind === "exhausted") {
            await storage.set(KEY, { ...state, pending: null });
            state = { ...state, pending: null };
            throw new Error(responseStatus.message);
          }
          const report = readResult(response, request);
          const done = { pending: null, reports: [...state.reports, report].slice(-300) };
          await storage.set(KEY, done);
          state = done;
          const text = report.outcome === "success" ? `${report.label}: ${report.value}` : "Špionáž neuspela";
          status(`${text} · straty ${report.losses} sond. Údaj platí v čase útoku.`);
          log(`Vojnový prieskum ${request.target}/${request.planet}: ${text}; straty ${report.losses} sond.`);
        });
      } catch (error) {
        status(`${error.message}${sent && state.pending ? " Výsledok je neistý; skontroluj Rozviedku." : ""}`, true);
        log(`Vojnový prieskum: ${error.message}`, "error");
      } finally { busy = false; render(); }
    }
    async function clearPending() {
      if (busy || !state.pending || !root.confirm("Skontroloval si výsledok v Rozviedke? Po potvrdení bude možné odoslať ďalšiu špionáž.")) return;
      const checked = { ...state.pending };
      busy = true; render();
      try {
        await W.withRenameLock(async () => {
          const saved = readState(await storage.get(KEY));
          if (!saved.pending) { state = saved; return; }
          if (["owner", "target", "planet", "field", "time"].some(key => saved.pending[key] !== checked[key])) {
            state = saved;
            throw new Error("Čakajúci útok sa medzičasom zmenil; skontroluj nový výsledok.");
          }
          const next = { ...saved, pending: null };
          await storage.set(KEY, next); state = next;
        });
        status("Neistý výsledok bol ručne označený ako skontrolovaný; údaje z reportu sa automaticky nedoplnili.");
        log("Vojnový prieskum: používateľ ručne potvrdil kontrolu neistého výsledku.");
      } catch (error) { status(`Kontrola zlyhala: ${error.message}`, true); log(`Vojnový prieskum: ${error.message}`, "error"); }
      finally { busy = false; render(); }
    }
    $("#sgo-intel-load").addEventListener("click", load);
    $("#sgo-intel-send").addEventListener("click", send);
    $("#sgo-intel-clear").addEventListener("click", clearPending);
    $("#sgo-intel-recon").addEventListener("click", async () => {
      try { revealGame(); await navigate(reconUrl()); }
      catch (error) { status(`Rozviedku sa nepodarilo otvoriť: ${error.message}`, true); log(`Vojnový prieskum: ${error.message}`, "error"); }
    });
    $("#sgo-intel-prepare-planet").addEventListener("click", async () => {
      if (busy || !target || !canEdit()) { status("Najprv načítaj hráča a dokonči prebiehajúcu operáciu.", true); return; }
      const type = $("#sgo-intel-attack-type").value;
      const planet = $("#sgo-intel-planet").value;
      if (!ATTACK_TYPES.includes(type) || !planet || !planets.some(item => item.value === planet)) { status("Vyber platný typ útoku a planétu.", true); return; }
      busy = true; render();
      try {
        if (W.readOwner(await getDocument(url({ page: "prehled" }))) !== owner) throw new Error("Prihlásený hráč sa zmenil; načítaj cieľ znova.");
        if (!canEdit()) throw new Error("Začala iná operácia; formulár neotváram.");
        root.sessionStorage.setItem(ATTACK_DRAFT_KEY, JSON.stringify({ owner, target, planet, type, createdAt: Date.now() }));
        const address = new URL(url({ page: "jednotky", utok: type, cil: target }));
        address.hash = ATTACK_DRAFT_HASH;
        log(`Vojnový prieskum: pripravujem útok ${type} na ${target}/${planet}; nič neodosielam.`);
        revealGame(); await navigate(address.href);
      } catch (error) {
        try { root.sessionStorage.removeItem(ATTACK_DRAFT_KEY); }
        catch (cleanupError) { log(`Vojnový prieskum: návrh sa nepodarilo odstrániť: ${cleanupError.message}`, "error"); }
        status(`Formulár sa nepodarilo otvoriť: ${error.message}`, true); log(`Vojnový prieskum: ${error.message}`, "error");
      } finally { busy = false; render(); }
    });
    $("#sgo-intel-target").addEventListener("input", () => {
      if (clean($("#sgo-intel-target").value) !== target) {
        target = ""; planets = []; recent = [];
        $("#sgo-intel-planet").replaceChildren();
        status("Zadaj presné meno hráča a načítaj jeho planéty.");
      }
      render();
    });
    for (const name of ["field", "planet", "attack-type"]) {
      $(`#sgo-intel-${name}`).addEventListener("change", () => { saveSelection(); render(); });
    }
    render();
    const initialized = (async () => {
      try {
        state = readState(await storage.get(KEY));
        ready = true;
        try {
          snapshot = readSnapshot(await storage.get(SNAPSHOT_KEY));
          if (snapshot) {
            const currentOwner = W.readOwner(await getDocument(url({ page: "prehled" })));
            if (currentOwner === snapshot.owner) {
              owner = snapshot.owner; target = snapshot.target; planets = snapshot.planets;
              recent = snapshot.recent; units = snapshot.units;
              $("#sgo-intel-target").value = target;
              populatePlanets(snapshot.planet);
              select.value = snapshot.field;
              $("#sgo-intel-attack-type").value = snapshot.attackType;
              const planetAge = snapshot.planetsTime < snapshot.time ? ` Zoznam planét je z ${new Date(snapshot.planetsTime).toLocaleString("sk-SK")}.` : "";
              status(`Uložený prehľad ${target} · načítaný ${new Date(snapshot.time).toLocaleString("sk-SK")}.${planetAge} Údaje môžu byť neaktuálne; pre nový stav klikni Načítať.`);
            } else {
              snapshot = null;
              status("Uložený prehľad patrí inému účtu; načítaj hráča znova.", true);
            }
          }
        } catch (error) {
          snapshot = null;
          status(`Uložený prehľad sa nepodarilo obnoviť: ${error.message}. Načítaj hráča znova.`, true);
          log(`Vojnový prieskum: uložený prehľad sa nepodarilo obnoviť: ${error.message}`, "error");
        }
      }
      catch (error) { status(`Načítanie prieskumu zlyhalo: ${error.message}`, true); log(`Vojnový prieskum: ${error.message}`, "error"); }
      render();
    })();
    const draftReady = (async () => {
      if (!root.document || new URL(root.location.href).hash !== ATTACK_DRAFT_HASH) return;
      try {
        const address = root.location.href;
        const cleanAddress = new URL(address); cleanAddress.hash = "";
        root.history.replaceState(root.history.state, "", cleanAddress.href);
        const raw = root.sessionStorage.getItem(ATTACK_DRAFT_KEY);
        root.sessionStorage.removeItem(ATTACK_DRAFT_KEY);
        if (!raw) throw new Error("Návrh útoku sa nenašiel v tejto karte.");
        const draft = JSON.parse(raw);
        const initialValue = root.document.querySelector('#formular [name="planeta2"]')?.value;
        if (W.readOwner(await getDocument(url({ page: "prehled" }))) !== draft.owner) throw new Error("Prihlásený hráč sa zmenil.");
        await initialized;
        applyAttackDraft(root.document, address, draft, initialValue);
        status(`Planéta ${draft.planet} je predvyplnená. Skontroluj hráča, planétu a jednotky; útok odošli ručne.`);
        log(`Vojnový prieskum: predvyplnená planéta ${draft.planet} pre útok na ${draft.target}; nič neodoslané.`);
      } catch (error) {
        status(`Predvyplnenie útoku zlyhalo: ${error.message}`, true);
        log(`Vojnový prieskum: predvyplnenie útoku zlyhalo: ${error.message}`, "error");
        root.alert(`SGO: Predvyplnenie útoku zlyhalo: ${error.message}. Skontroluj herný formulár.`);
      }
    })();
    return { load, send, initialized, draftReady, flush: () => snapshotWrites, get isWorking() { return busy; } };
  }
  const api = { KEY, SNAPSHOT_KEY, ATTACK_DRAFT_KEY, FIELDS, readState, readSnapshot, applyAttackDraft, spyForm, readResult, readRecent, readSpyReports, readUnits, mergeReports, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOWarIntel = api;
})(globalThis);
