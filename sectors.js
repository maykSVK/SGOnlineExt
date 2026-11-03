(function (root) {
  "use strict";
  const C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.SGO;
  const DRAFT_KEY = "sgo-addon-sector-draft";
  function isForum(url) {
    const params = new URL(url).searchParams;
    return params.get("page") === "forum" && params.get("forum") === "4";
  }
  function readRace(doc) {
    const matches = [...doc.scripts].map(s => s.textContent.match(/\bvar\s+myRace\s*=\s*["']race-(\d+)["']/)).filter(Boolean);
    if (matches.length !== 1) throw new Error("Nedá sa jednoznačne určiť tvoja rasa z Mapy.");
    const option = [...doc.querySelectorAll("#filterRace option")].find(o => o.value === matches[0][1]);
    if (!option) throw new Error("Tvoja rasa chýba v legende Mapy.");
    return C.clean(option.textContent);
  }
  function readSectors(doc) {
    const table = [...doc.querySelectorAll(".contentStranky table")].find(t => [...t.rows].some(r => /^Sektor:/.test(C.clean(r.cells[0]?.textContent))));
    if (!table) throw new Error("Nenašiel som tabuľku Mapa > Sektory.");
    const sectors = [];
    let current;
    for (const row of table.rows) {
      if (row.querySelector("th")) {
        const title = C.clean(row.cells[0].textContent);
        const match = title.match(/^Sektor:\s*(.+?)\s*\((\d+)\)$/);
        if (!match) {
          if (!/^Sektor:\s*Planety mimo sektory$/.test(title)) throw new Error(`Neznámy nadpis sektora: ${title}`);
          current = null;
          continue;
        }
        current = { name: match[1], id: Number(match[2]), races: [] };
        sectors.push(current);
      } else if (current) {
        const race = C.clean(row.cells[1]?.textContent);
        const count = C.integer(row.cells[2]?.textContent || "");
        if (!race || count === null || current.races.some(r => r.race === race)) throw new Error(`Nečitateľné počty v sektore ${current.name}.`);
        current.races.push({ race, count });
      }
    }
    if (!sectors.length || sectors.some(s => !s.races.length) || new Set(sectors.map(s => s.id)).size !== sectors.length) {
      throw new Error("Zoznam sektorov je neúplný alebo nejednoznačný.");
    }
    return sectors;
  }
  function leaders(sectors, race) {
    return sectors.flatMap(sector => {
      const own = sector.races.find(r => r.race === race)?.count || 0;
      const rivals = sector.races.filter(r => r.race !== race).sort((a, b) => b.count - a.count || a.race.localeCompare(b.race, "cs"));
      const rivalCount = rivals[0]?.count || 0;
      if (own <= rivalCount) return [];
      return [{ id: sector.id, name: sector.name, own, rivalCount,
        rivals: rivals.filter(r => r.count === rivalCount).map(r => r.race).join(", ") || "Žiadna",
        difference: own - rivalCount }];
    }).sort((a, b) => a.difference - b.difference || a.name.localeCompare(b.name, "cs") || a.id - b.id);
  }
  function bbText(text) {
    return String(text).replace(/\[/g, "［").replace(/\]/g, "］").replace(/[\r\n]+/g, " ");
  }
  function bbcode(report) {
    const title = `[b]Sektory – ${bbText(report.race)} – ${bbText(report.time)}[/b]`;
    if (!report.rows.length) return `${title}\nMomentálne nevedieme v žiadnom sektore.`;
    const header = "[tr][th]Sektor[/th][th]Naše[/th][th]Najsilnejší súper[/th][th]Súper[/th][th]Náskok[/th][/tr]";
    const rows = report.rows.map(r => `[tr][td]${bbText(r.name)} (${r.id})[/td][td]${r.own}[/td][td]${bbText(r.rivals)}[/td][td]${r.rivalCount}[/td][td]+${r.difference}[/td][/tr]`);
    return `${title}\n[table]${header}${rows.join("")}[/table]`;
  }
  function forumDraft(report) {
    return { title: `Sektory – ${bbText(report.race)} – ${bbText(report.time)}`, code: bbcode(report), rows: report.rows.length };
  }
  function fillForumDraft(doc, draft) {
    if (!draft || typeof draft.title !== "string" || !draft.title.trim() ||
        typeof draft.code !== "string" || !draft.code.trim() || !Number.isSafeInteger(draft.rows) || draft.rows < 0) {
      throw new Error("Uložené hlásenie sektorov je neplatné. Obnov prehľad a skús znova.");
    }
    const text = doc.querySelector("textarea#text[name=text]");
    const form = text?.form;
    const title = form?.querySelector("input[name=titulek]");
    const editor = form?.querySelector(".note-editable");
    if (!title || !editor || !form.querySelector("[name=new]")) {
      throw new Error("Editor Oznámení vedení nie je pripravený. Po načítaní stránky skús Predplniť fórum znova.");
    }
    const hasContent = html => {
      const content = doc.createElement("div");
      content.innerHTML = html;
      return C.clean(content.textContent).length > 0 || !!content.querySelector("img,table,iframe,video,audio,hr,svg,object,embed");
    };
    const codeView = form.querySelector(".note-codable");
    if (title.value.trim() || hasContent(text.value) || hasContent(editor.innerHTML) ||
        (codeView && hasContent(codeView.value))) {
      throw new Error("Na fóre už máš rozpísaný príspevok. Neprepísal som ho. Najprv ho dokonči alebo vymaž a skús znova.");
    }
    if (form.querySelector(".note-editor.codeview")) {
      throw new Error("Prepni editor z HTML zdroja späť na bežné písanie a skús Predplniť fórum znova.");
    }
    const view = doc.defaultView;
    const clipboard = new view.DataTransfer();
    clipboard.setData("text/plain", draft.code);
    editor.focus();
    // Let the game's own paste handler convert BBCode and update Summernote.
    const paste = new view.ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard });
    editor.dispatchEvent(paste);
    const table = editor.querySelector("table");
    if (!paste.defaultPrevented || !C.clean(editor.textContent) ||
        (draft.rows > 0 && (!table || table.rows.length !== draft.rows + 1 ||
          [...table.rows].some(row => row.cells.length !== 5)))) {
      throw new Error("Fórum nepotvrdilo vloženie celého hlásenia. Skontroluj editor; nič som neodoslal.");
    }
    text.value = editor.innerHTML;
    title.value = draft.title;
    for (const field of [text, title]) {
      field.dispatchEvent(new view.Event("input", { bubbles: true }));
      field.dispatchEvent(new view.Event("change", { bubbles: true }));
    }
    editor.dispatchEvent(new view.KeyboardEvent("keyup", { bubbles: true }));
    form.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function mount(container, { getDocument, log, canEdit = () => true, navigate = url => location.assign(url), revealGame = () => {} }) {
    container.innerHTML = `<div class="sgo-feature-heading"><span class="sgo-eyebrow">MAPA / SEKTORY</span><h3>Naše sektory</h3>
      <p class="sgo-hint">Vedenie našej rasy, od najtesnejšieho náskoku.</p></div>
      <div class="sgo-sector-actions"><button type="button" id="sgo-sectors-load">Obnoviť</button><button type="button" id="sgo-sectors-prefill" disabled>Predplniť fórum</button></div>
      <div id="sgo-sector-summary" class="sgo-sector-summary" hidden></div>
      <p id="sgo-sectors-status" class="sgo-hint" role="status">Načítaj aktuálny prehľad.</p>
      <div class="sgo-sector-scroll"><div id="sgo-sectors-list"></div>
      </div><div class="sgo-sector-links"><a href="game.php?page=vesmir&jak=sektory">Mapa / Sektory &nearr;</a><a href="game.php?page=forum&forum=4">Oznámení vedení &nearr;</a></div>`;
    const $ = selector => container.querySelector(selector);
    let loading;
    let draft;
    function message(text, error = false) {
      $("#sgo-sectors-status").textContent = text;
      $("#sgo-sectors-status").classList.toggle("sgo-error", error);
    }
    async function load() {
      $("#sgo-sectors-load").disabled = true;
      $("#sgo-sectors-prefill").disabled = true;
      draft = null;
      $("#sgo-sector-summary").hidden = true;
      $("#sgo-sectors-list").replaceChildren();
      message("Načítavam tvoju rasu a počty planét v sektoroch...");
      try {
        const map = await getDocument(new URL("game.php?page=vesmir&jak=map", location.href).href);
        const doc = await getDocument(new URL("game.php?page=vesmir&jak=sektory", location.href).href);
        const race = readRace(map);
        const rows = leaders(readSectors(doc), race);
        const time = new Date().toLocaleString("sk-SK");
        draft = forumDraft({ race, rows, time });
        const summary = $("#sgo-sector-summary");
        const identity = document.createElement("span"); identity.textContent = race;
        const total = document.createElement("strong"); total.textContent = `${rows.length} sektorov`;
        summary.replaceChildren(identity, total); summary.hidden = false;
        for (const row of rows) {
          const card = document.createElement("article");
          card.className = "sgo-sector-card";
          const heading = document.createElement("div"); heading.className = "sgo-sector-heading";
          const title = document.createElement("strong"); title.textContent = row.name;
          const id = document.createElement("small"); id.textContent = `#${row.id}`;
          heading.append(title, id);
          const margin = document.createElement("div"); margin.className = "sgo-sector-margin";
          const number = document.createElement("b"); number.textContent = `+${row.difference}`;
          margin.title = "Náskok pred najsilnejšou inou rasou";
          margin.append(number);
          const detail = document.createElement("div"); detail.className = "sgo-sector-comparison";
          const counts = document.createElement("strong"); counts.textContent = `${row.own} : ${row.rivalCount}`;
          counts.title = `${race} : ${row.rivals}`;
          const rival = document.createElement("span"); rival.textContent = row.rivals; rival.title = row.rivals;
          detail.append(counts, rival);
          card.append(heading, detail, margin);
          $("#sgo-sectors-list").append(card);
        }
        message(`Aktualizované ${time}${rows.length ? "" : " · Momentálne nikde nevedieme."}`);
        $("#sgo-sectors-prefill").disabled = false;
        log(`Sektory ${race}: ${rows.map(r => `${r.name} ${r.own}:${r.rivalCount} (+${r.difference})`).join(", ") || "žiadne vedenie"}. Stav ${time}.`);
        return true;
      } catch (error) { message(error.message, true); log(`Sektory: ${error.message}`, "error"); return false; }
      finally { $("#sgo-sectors-load").disabled = false; }
    }
    function refresh() {
      if (loading) return loading;
      loading = load().finally(() => { loading = null; });
      return loading;
    }
    $("#sgo-sectors-load").addEventListener("click", refresh);
    function prefill(value) {
      if (!canEdit()) throw new Error("Najprv zastav prebiehajúce útoky a počkaj na dokončenie operácie.");
      fillForumDraft(document, value);
      message("Fórum je predplnené. Skontroluj nadpis a tabuľku; odoslanie je na tebe.");
      log("Hlásenie sektorov predplnené do Oznámení vedení. Príspevok nebol odoslaný.");
      revealGame();
    }
    function reportError(error) {
      message(error.message, true);
      log(`Sektory: ${error.message}`, "error");
    }
    async function resumeForumDraft() {
      if (!isForum(location.href)) return;
      try {
        const pending = sessionStorage.getItem(DRAFT_KEY);
        if (!pending) return;
        sessionStorage.removeItem(DRAFT_KEY);
        if (loading) await loading;
        prefill(JSON.parse(pending));
      } catch (error) { reportError(error); }
    }
    $("#sgo-sectors-prefill").addEventListener("click", async () => {
      try {
        if (!draft) throw new Error("Najprv načítaj aktuálny prehľad sektorov.");
        if (!canEdit()) throw new Error("Najprv zastav prebiehajúce útoky a počkaj na dokončenie operácie.");
        if (isForum(location.href)) { prefill(draft); return; }
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        log("Otváram Oznámení vedení na predplnenie hlásenia sektorov.");
        await navigate(new URL("game.php?page=forum&forum=4", location.href).href);
      } catch (error) { reportError(error); }
    });
    return { refresh, resumeForumDraft };
  }
  const api = { readRace, readSectors, leaders, bbcode, forumDraft, fillForumDraft, isForum, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SGOSectors = api;
})(globalThis);
