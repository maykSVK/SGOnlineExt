(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const CITY_CAPACITY = 9000000;
  function number(text, label) {
    const value = C.integer(text);
    if (value === null) throw new Error(`Nečitateľný údaj: ${label}. Obnov stránku.`);
    return value;
  }
  function pair(text, label) {
    const parts = C.clean(text).split("/");
    if (parts.length !== 2) throw new Error(`Nečitateľný údaj: ${label}.`);
    return parts.map(part => number(part.trim(), label));
  }
  function occupancy(text, capacity) {
    if (C.clean(text).includes("/")) return pair(text, "zastavanosť");
    const built = number(text, "zastavanosť");
    if (built !== capacity) throw new Error("Nečitateľná zastavanosť: samostatný počet nezodpovedá plnej kapacite.");
    return [built, capacity];
  }
  function buildingForm(doc) {
    return [...doc.forms].find(f => f.querySelector('[name="vyroben"]') && f.querySelector('select[name="planeta"]') && f.querySelector('[name="postavit"]'));
  }
  function workerCost(form, name) {
    const input = form.querySelector(`[name="${name}"]`);
    const match = input?.closest(".inf")?.textContent.match(/-\s*([\d\s\u00a0]+)\s*lidí/);
    const workers = match ? number(match[1], `zamestnanci ${name}`) : null;
    if (!workers) throw new Error(`Chýba počet pracovníkov budovy ${name}.`);
    return workers;
  }
  function readBuildings(doc) {
    const form = buildingForm(doc);
    if (!form) throw new Error("Nenašiel som formulár Planety > Stavění.");
    const costs = Object.fromEntries(["vyroben", "sdi", "bs", "laboratori"].map(name => [name, workerCost(form, name)]));
    const options = [...form.querySelector('[name="planeta"]').options];
    const planets = options.map(option => {
      const row = doc.getElementById(`pln${option.value}`);
      if (!row || row.cells.length < 10) throw new Error(`Chýba stavebný riadok planéty ${option.textContent}.`);
      const cells = row.cells;
      const typeLink = cells[0].querySelector('a[href*="typ="]');
      const type = typeLink ? new URL(typeLink.getAttribute("href"), "https://stargame-online.cz/www/game.php").searchParams.get("typ") : null;
      if (!type) throw new Error(`Chýba druh planéty ${option.textContent}.`);
      const [factories, factorySlots] = pair(cells[3].textContent, "výrobne / kapacita");
      const [built, slots] = occupancy(cells[9].textContent, factorySlots);
      if (slots !== factorySlots) throw new Error("Nesúhlasí stavebná kapacita planéty.");
      return {
        id: option.value, name: C.clean(option.textContent), type,
        cities: number(cells[2].textContent, "mestá"), factories, built, slots,
        sdi: number(cells[4].textContent, "SDI"), bs: number(cells[5].textContent, "BS"),
        labs: number(cells[7].textContent, "laboratóriá")
      };
    });
    if (!planets.length) throw new Error("Nenašiel som žiadne planéty.");
    return { planets, costs };
  }
  function readGrowth(doc) {
    const result = {};
    for (const anchor of doc.querySelectorAll('a[name^="id"]')) {
      const row = anchor.closest("tr");
      const id = anchor.getAttribute("name").slice(2);
      if (!row || row.cells.length < 5) continue;
      const text = C.clean(row.cells[4].textContent);
      if (!/^\d+(?:[.,]\d+)?\s*%$/.test(text)) throw new Error(`Nečitateľný prírastok druhu ${id}.`);
      result[id] = Number(text.replace("%", "").replace(",", ".").trim());
    }
    if (!Object.keys(result).length) throw new Error("Nenašiel som denné prírastky v Druhoch planét.");
    return result;
  }
  function readTrade(doc) {
    const result = {};
    for (const row of doc.querySelectorAll('tr[id^="p"]')) {
      if (!/^p\d+$/.test(row.id) || row.cells.length < 6) continue;
      result[row.id.slice(1)] = {
        sellable: number(row.cells[2].textContent, "nezamestnaní na predaj"),
        room: number(row.cells[3].textContent, "voľné miesto pre obyvateľov")
      };
    }
    if (!Object.keys(result).length) throw new Error("Nenašiel som zoznam planét v Obchod > Nezaměstnaní.");
    return result;
  }
  function calculate(planet, growth, costs, trade) {
    const values = [planet.cities, planet.factories, planet.sdi, planet.bs, planet.labs, planet.built, planet.slots, trade?.room,
      costs.vyroben, costs.sdi, costs.bs, costs.laboratori];
    if (values.some(v => !Number.isSafeInteger(v) || v < 0) || !costs.vyroben || !Number.isFinite(growth) || growth < 0) {
      throw new Error(`Neplatné vstupy výpočtu pre ${planet.name}.`);
    }
    const capacity = planet.cities * CITY_CAPACITY;
    const constant = 1 + growth / 100;
    const idealPopulation = capacity / constant;
    const otherEmployed = planet.sdi * costs.sdi + planet.bs * costs.bs + planet.labs * costs.laboratori;
    const targetFactories = Math.max(0, Math.floor((idealPopulation - otherEmployed) / costs.vyroben));
    const missing = planet.built === planet.slots ? 0 : Math.max(0, targetFactories - planet.factories);
    const population = capacity - trade.room;
    const employed = planet.factories * costs.vyroben + otherEmployed;
    if (population < employed || population > capacity || planet.built > planet.slots) {
      throw new Error(`Údaje planéty ${planet.name} sa zmenili alebo nesúhlasia. Obnov výpočet.`);
    }
    const unemployed = population - employed;
    const workersNeeded = missing * costs.vyroben;
    return {
      ...planet, growth, capacity, constant, idealPopulation, otherEmployed, targetFactories, missing, workforce: { ...costs },
      population, employed, unemployed, workersNeeded,
      missingWorkers: Math.max(0, workersNeeded - unemployed),
      freeSlots: planet.slots - planet.built,
      buildableNow: Math.min(missing, Math.floor(unemployed / costs.vyroben), planet.slots - planet.built),
      excess: Math.max(0, planet.factories - targetFactories)
    };
  }
  function snapshot(buildings, types, trade) {
    const { planets, costs } = readBuildings(buildings);
    const growth = readGrowth(types);
    const workers = readTrade(trade);
    return planets.map(planet => {
      if (growth[planet.type] === undefined || !workers[planet.id]) throw new Error(`Chýbajú údaje pre ${planet.name}.`);
      return calculate(planet, growth[planet.type], costs, workers[planet.id]);
    });
  }
  function fill(doc, report) {
    const { planets, costs } = readBuildings(doc);
    const current = planets.find(p => p.id === report.id);
    if (!current || ["cities", "factories", "sdi", "bs", "labs", "built", "slots", "type"].some(key => current[key] !== report[key]) ||
      Object.keys(costs).some(key => costs[key] !== report.workforce?.[key])) {
      throw new Error("Stavby na stránke už nesúhlasia s výpočtom. Obnov údaje pred predvyplnením.");
    }
    const form = buildingForm(doc);
    const otherInputs = ["mest", "sdi", "bs", "parku", "laboratori", "kasaren"].map(name => form.elements.namedItem(name));
    if (otherInputs.some(input => !input || (input.value.trim() && input.value.trim() !== "0"))) {
      throw new Error("Formulár obsahuje iné rozpracované stavby. Najprv ich vymaž; nič som neprepísal.");
    }
    const mode = form.querySelector('[name="verze"]');
    if (!mode || ![...mode.options].some(o => o.value === "0")) throw new Error("Chýba režim pristavovania.");
    const changes = [[form.elements.namedItem("planeta"), report.id], [mode, "0"], [form.elements.namedItem("vyroben"), String(report.missing)]];
    for (const [input, value] of changes) {
      input.value = value;
      const EventType = doc.defaultView.Event;
      input.dispatchEvent(new EventType("input", { bubbles: true }));
      input.dispatchEvent(new EventType("change", { bubbles: true }));
    }
    doc.querySelectorAll("tr.sgo-prefilled-planet").forEach(row => {
      row.classList.remove("sgo-prefilled-planet");
      row.removeAttribute("aria-current");
    });
    const row = doc.getElementById(`pln${report.id}`);
    row.classList.add("sgo-prefilled-planet");
    row.setAttribute("aria-current", "true");
    row.scrollIntoView({ block: "center", behavior: "instant" });
    return report.missing;
  }
  function mount(container, { getDocument, log, canEdit }) {
    container.innerHTML = `<div class="sgo-feature-heading"><span class="sgo-eyebrow">PLANÉTY / STAVĚNÍ</span><h3>Ideálne zaľudnenie</h3>
      <p class="sgo-hint">Výpočet a predvyplnenie výroben. Stavbu aj presuny obyvateľov potvrdzuješ sám.</p></div>
      <div class="sgo-pop-tools"><button type="button" id="sgo-pop-load">Prepočítať planéty</button>
      <a href="game.php?page=planety">Stavění</a><a href="game.php?page=obchod">Nezaměstnaní</a></div>
      <p id="sgo-pop-status" class="sgo-hint" role="status">Načítaj aktuálne stavby, denné prírastky a voľnú kapacitu obyvateľov.</p>
      <div class="sgo-pop-scroll"><label class="sgo-pop-label" for="sgo-pop-planet">Planéta</label><select id="sgo-pop-planet" disabled></select>
      <div id="sgo-pop-report"></div><div id="sgo-pop-list"></div></div>`;
    const $ = selector => container.querySelector(selector);
    let reports = [];
    const nativePlanet = buildingForm(document)?.querySelector('[name="planeta"]');
    let selected = nativePlanet?.value || "";
    let nativeSelection = !!selected;
    let loading = false;
    let refreshing;
    nativePlanet?.addEventListener("change", event => {
      selected = event.target.value;
      nativeSelection = true;
      $("#sgo-pop-planet").value = selected;
      showReport();
      if (!container.hidden) refresh();
      document.querySelectorAll("tr.sgo-prefilled-planet").forEach(row => {
        if (row.id !== `pln${event.target.value}`) {
          row.classList.remove("sgo-prefilled-planet");
          row.removeAttribute("aria-current");
        }
      });
    });
    const fmt = value => Math.floor(value).toLocaleString("sk-SK");
    const message = (text, error = false) => {
      $("#sgo-pop-status").textContent = text;
      $("#sgo-pop-status").classList.toggle("sgo-error", error);
    };
    function showReport() {
      const report = reports.find(r => r.id === selected);
      const target = $("#sgo-pop-report");
      target.replaceChildren();
      if (!report) {
        if (nativeSelection && !loading) {
          const note = document.createElement("p");
          note.className = "sgo-hint";
          note.textContent = "Planéta vybraná v hre nepotrebuje ďalšie výrobne. Nič nepredvypĺňam.";
          target.append(note);
        }
        return;
      }
      const metrics = document.createElement("dl");
      metrics.className = "sgo-pop-metrics";
      const entries = [
        ["Počet miest X", fmt(report.cities)],
        ["Mestá × 9 000 000", fmt(report.capacity)],
        [`Denný prírastok ${report.growth} % · K`, report.constant.toLocaleString("sk-SK")],
        ["Ideálna populácia Y / K", fmt(report.idealPopulation)],
        ["Zamestnaní mimo výroben", fmt(report.otherEmployed)],
        ["Cieľ výroben (nadol)", fmt(report.targetFactories)],
        ["Postavené výrobne", fmt(report.factories)],
        ["Dostavať výrobne", `+${fmt(report.missing)}`],
        ["Teraz možno postaviť", fmt(report.buildableNow)],
        ["Nezamestnaní na planéte", fmt(report.unemployed)],
        ["Doplniť pracovníkov", fmt(report.missingWorkers)],
        ["Voľné stavebné miesta", fmt(report.freeSlots)]
      ];
      for (const [label, value] of entries) {
        const dt = document.createElement("dt"); dt.textContent = label;
        const dd = document.createElement("dd"); dd.textContent = value; metrics.append(dt, dd);
      }
      const note = document.createElement("p"); note.className = "sgo-hint";
      note.textContent = report.excess ? `Máš o ${fmt(report.excess)} výroben viac než cieľ. Nič nebúram ani nepredvypĺňam na demolíciu.` :
        `Predvyplním celý chýbajúci počet, aj keď zatiaľ chýbajú ľudia. ${report.missing > report.freeSlots ? "Pozor: nestačí ani stavebná kapacita." : "Pred potvrdením skontroluj aj naqiton."}`;
      const button = document.createElement("button");
      button.type = "button"; button.className = "sgo-pop-fill"; button.textContent = `Predvyplniť +${fmt(report.missing)} výroben`;
      button.disabled = !report.missing;
      button.addEventListener("click", async () => {
        try {
          if (!canEdit()) throw new Error("Najprv zastav sériu útokov a počkaj na dokončenie načítania.");
          const id = report.id;
          if (!await refresh()) return;
          const current = reports.find(r => r.id === id);
          if (!current) {
            message("Táto planéta už nepotrebuje ďalšie výrobne. Zo zoznamu bola skrytá.");
            return;
          }
          if (!canEdit()) throw new Error("Počas prepočtu sa spustila iná akcia. Najprv ju zastav.");
          fill(document, current);
          const text = `${current.name}: predvyplnených ${fmt(current.missing)} výroben. Potrebuješ doplniť ${fmt(current.missingWorkers)} pracovníkov. Formulár nebol odoslaný.`;
          log(text); message(text);
        } catch (error) { message(error.message, true); log(`Zaľudnenie: ${error.message}`, "error"); }
      });
      target.append(metrics, note, button);
      if (!buildingForm(document)) {
        button.disabled = true;
        note.textContent += " Pre predvyplnenie otvor Planety > Stavění a znovu prepočítaj.";
      }
    }
    $("#sgo-pop-planet").addEventListener("change", () => { selected = $("#sgo-pop-planet").value; nativeSelection = false; showReport(); refresh(); });
    async function load() {
      try {
        if (!canEdit()) throw new Error("Najprv zastav sériu útokov a počkaj na dokončenie načítania.");
        loading = true;
        $("#sgo-pop-load").disabled = true;
        $("#sgo-pop-planet").disabled = true;
        $("#sgo-pop-report").replaceChildren();
        $("#sgo-pop-list").replaceChildren();
        reports = [];
        message("Načítavam Stavění, Druhy planét a Nezaměstnané. Nič neodosielam.");
        const buildingDoc = await getDocument(new URL("game.php?page=planety", location.href).href);
        const typesDoc = await getDocument(new URL("game.php?page=planety&s=typy", location.href).href);
        const tradeDoc = await getDocument(new URL("game.php?page=obchod", location.href).href);
        const allReports = snapshot(buildingDoc, typesDoc, tradeDoc);
        reports = allReports.filter(report => report.missing > 0);
        const selector = $("#sgo-pop-planet");
        selector.replaceChildren(...reports.map(report => {
          const option = document.createElement("option"); option.value = report.id;
          option.textContent = `${report.name} · +${fmt(report.missing)}`; return option;
        }));
        if (nativeSelection && !reports.some(r => r.id === selected)) {
          const placeholder = document.createElement("option");
          placeholder.value = selected;
          placeholder.textContent = `${nativePlanet.selectedOptions[0]?.textContent || "Vybraná planéta"} · hotovo`;
          placeholder.disabled = true;
          selector.prepend(placeholder);
        } else {
          selected = reports.some(r => r.id === selected) ? selected : selector.value;
        }
        selector.value = selected; selector.disabled = !reports.length;
        loading = false;
        showReport();
        const list = $("#sgo-pop-list");
        for (const report of reports) {
          const button = document.createElement("button"); button.type = "button"; button.className = "sgo-pop-row";
          const name = document.createElement("span"); name.textContent = report.name;
          const count = document.createElement("strong"); count.textContent = `+${fmt(report.missing)}`;
          button.append(name, count);
          button.addEventListener("click", () => { selected = report.id; nativeSelection = false; selector.value = selected; showReport(); refresh(); $("#sgo-pop-report").scrollIntoView({ block: "nearest" }); });
          list.append(button);
          log(`Zaľudnenie ${report.name}: X=${report.cities}, P=${report.growth} %, cieľ ${report.targetFactories}, postavené ${report.factories}, dostavať ${report.missing}, doplniť ľudí ${report.missingWorkers}.`);
        }
        message(reports.length
          ? `Prepočítaných ${allReports.length} planét · zostáva ${reports.length} na dostavanie. Hotové planéty sú skryté. ${new Date().toLocaleTimeString("sk-SK")}`
          : "Všetky planéty majú cieľový počet výroben alebo viac. Nie je čo dostavať.");
        return true;
      } catch (error) { message(error.message, true); log(`Zaľudnenie: ${error.message}`, "error"); return false; }
      finally { loading = false; $("#sgo-pop-load").disabled = false; }
    }
    function refresh() {
      if (loading) return refreshing;
      refreshing = load();
      return refreshing;
    }
    $("#sgo-pop-load").addEventListener("click", refresh);
    return { refresh };
  }
  const api = { occupancy, readBuildings, readGrowth, readTrade, calculate, snapshot, fill, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOPopulation = api;
})(globalThis);
