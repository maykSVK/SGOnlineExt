(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const P = typeof module !== "undefined" && module.exports ? require("./population.js") : root.SGOPopulation;
  const SETTINGS_KEY = "sgo-parks-target";
  const DRAFT_KEY = "sgo-parks-draft";

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
      return { id: planet.id, name: planet.name, parks, freeSlots: planet.slots - planet.built };
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
    if (planet.freeSlots < report.missing) throw new Error(`Chýbajú stavebné miesta: treba ${report.missing}, voľných je ${planet.freeSlots}. Nič nebúram.`);
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
      [form.elements.namedItem("parku"), String(report.missing)]]) {
      field.value = value;
      for (const event of ["input", "change"]) field.dispatchEvent(new doc.defaultView.Event(event, { bubbles: true }));
    }
    form.scrollIntoView({ block: "center" });
  }

  function mount(container, { getDocument, postDocument, storage, session = root.sessionStorage,
    navigate = url => root.location.assign(url), log = () => {}, canEdit = () => true, revealGame = () => {} }) {
    container.innerHTML = `<div class="sgo-feature-heading"><span class="sgo-eyebrow">PLANÉTY / SPOKOJNOSŤ</span><h3>Parky a spokojnosť</h3>
      <p class="sgo-hint">Minimum ďalších parkov pre zvolený cieľ. Výpočet zahŕňa aktuálne bonusy aj nezamestnaných; po ich zmene ho zopakuj. Nič nebúra ani nestavia.</p></div>
      <div class="sgo-parks-tools"><label>Cieľ spokojnosti (%)<input id="sgo-parks-target" type="number" min="0" max="200" step="0.1" value="180"></label>
      <button type="button" id="sgo-parks-save">Uložiť cieľ</button><button type="button" id="sgo-parks-load">Prepočítať planéty</button><button type="button" id="sgo-parks-stop" disabled>Zastaviť</button></div>
      <p class="sgo-hint">Každá planéta potrebuje vlastný detail, väčší zoznam chvíľu trvá. Pri nedostatku miesta sa stavba nepredvyplní. Pri už splnenom cieli neodhadujeme nadbytočné parky.</p>
      <p id="sgo-parks-status" class="sgo-hint" role="status">Cieľ 180 % · načítanie je ručné.</p>
      <div class="sgo-parks-scroll" tabindex="0" role="region" aria-label="Parky na planétach"><table class="sgo-war-table"><thead><tr><th>Planéta</th><th>Spokojnosť</th><th>Parky</th><th>Doplniť</th><th></th></tr></thead><tbody id="sgo-parks-list"></tbody></table></div>`;
    const $ = selector => container.querySelector(selector);
    let target = 180;
    let rows = [];
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
      for (const id of ["load", "save", "target"]) $(`#sgo-parks-${id}`).disabled = working;
      $("#sgo-parks-stop").disabled = !working;
    };
    const detail = (planet, goal) => postDocument(url({ page: "planety", s: "detail" }),
      new URLSearchParams({ planeta: planet.id, vyberpl: "Vyber planetu" })).then(doc => readDetail(doc, planet, goal));

    function render() {
      const list = $("#sgo-parks-list");
      list.replaceChildren();
      for (const row of rows) {
        const tr = container.ownerDocument.createElement("tr");
        const report = row.report && { ...row.report, ...calculate(row.report.happiness, row.report.parks, target) };
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
          button.textContent = report.freeSlots < report.missing ? `Miesto ${report.freeSlots}/${report.missing}` : "Predvyplniť";
          button.disabled = working || report.freeSlots < report.missing;
          button.addEventListener("click", () => prepare(report));
          cell.append(button);
        } else if (report) cell.textContent = "Cieľ splnený";
        tr.append(cell);
        list.append(tr);
      }
    }

    async function apply(planetId, name, goal) {
      if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
      const planet = readPlanets(container.ownerDocument).find(item => item.id === planetId && item.name === name);
      if (!planet) throw new Error("Planéta už nemá pôvodný názov alebo ju nevlastníš.");
      const report = await detail(planet, goal);
      if (!canEdit()) throw new Error("Začala iná operácia; nič nepredvypĺňam.");
      fill(container.ownerDocument, report);
      revealGame();
      const text = `${planet.name}: predvyplnených ${report.missing} parkov pre cieľ ${goal} %. Skontroluj cenu a potvrď stavbu v hre.`;
      message(text);
      log(`Parky: ${text}`);
    }

    async function prepare(report) {
      if (working) return;
      working = true;
      controls(); render();
      try {
        if (!canEdit()) throw new Error("Najprv dokonči prebiehajúcu operáciu.");
        const params = new URL(root.location.href).searchParams;
        if (params.get("page") === "planety" && !params.has("s")) {
          await apply(report.id, report.name, target);
        } else {
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
          render();
        }
        message(`${stopped ? "Zastavené" : "Prepočítané"} ${rows.length}/${planets.length} planét · cieľ ${target} % · ${failures} chýb.`, failures > 0);
        log(`Parky: načítaných ${rows.length}/${planets.length} planét, cieľ ${target} %, chyby ${failures}.`);
      } catch (error) {
        message(error.message, true); log(`Parky: ${error.message}`, "error");
      } finally { working = false; controls(); render(); }
    }

    async function restore() {
      try {
        const saved = await storage.get(SETTINGS_KEY);
        target = targetValue(saved == null ? 180 : saved);
        $("#sgo-parks-target").value = String(target);
        message(`Cieľ ${target} % · načítanie je ručné.`);
        return true;
      } catch (error) {
        message(error.message, true); log(`Parky: ${error.message}`, "error");
        return false;
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
    $("#sgo-parks-stop").addEventListener("click", () => { stopped = true; });
    const draftsReady = ready.then(async ok => {
      if (!ok) return;
      const params = new URL(root.location.href).searchParams;
      if (params.get("page") !== "planety" || params.has("s")) return;
      working = true; controls();
      try {
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
    return { load, ready, draftsReady };
  }
  const api = { targetValue, calculate, readPlanets, readDetail, fill, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOParks = api;
})(globalThis);
