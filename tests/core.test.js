const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

test("strict counts support Czech thousands, reject invalid values", () => {
  assert.equal(C.integer("48\u00a0930"), 48930);
  for (const input of ["", "-1", "1.5", "1e3", "Infinity", "99999999999999999"]) assert.equal(C.integer(input), null);
});

test("all follows current inventory, exact quantities never silently clamp", () => {
  const fields = [{ name: "pocet_zlodej", label: "Zlodej", available: 20000 }];
  assert.deepEqual(C.quantities(fields, { pocet_zlodej: "all" }), { pocet_zlodej: 20000 });
  fields[0].available = 19000;
  assert.deepEqual(C.quantities(fields, { pocet_zlodej: "all" }), { pocet_zlodej: 19000 });
  assert.throws(() => C.quantities(fields, { pocet_zlodej: "20000" }));
  assert.throws(() => C.quantities(fields, { pocet_zlodej: "0" }));
  assert.throws(() => C.quantities(fields, { pocet_zlodej: "-2" }));
});

test("round robin uses only selected attacks and independent cooldowns", () => {
  const plans = { 1: { enabled: false }, 3: { enabled: true }, 7: { enabled: true } };
  const order = ["1", "3", "7"];
  assert.deepEqual(C.nextAttack(order, plans, { 3: 5000 }, 0, 1000), { id: "7", cursor: 0 });
  assert.equal(C.nextAttack(order, plans, { 3: 5000, 7: 6000 }, 0, 1000), null);
  assert.deepEqual(C.nextAttack(order, plans, {}, 2, 1000), { id: "7", cursor: 0 });
  assert.deepEqual(C.nextAttack(order, plans, {}, 0, 1000), { id: "3", cursor: 2 });
  plans[3].enabled = false;
  assert.deepEqual(C.nextAttack(order, plans, {}, 0, 1000), { id: "7", cursor: 0 });
});

test("cooldown accepts explicit wait messages, not report or inventory", () => {
  assert.deepEqual(C.cooldown("Musíte počkat 18 sekund před dalším útokem."), { delay: 19000 });
  assert.deepEqual(C.cooldown("Další útok nejdříve za 2 minuty."), { delay: 121000 });
  assert.deepEqual(C.cooldown("Využívat zlodějského útoku můžete až za 7 sekund"), { delay: 8000 });
  assert.deepEqual(C.cooldown("Ještě musíte počkat před dalším útokem."), { delay: null });
  assert.equal(C.cooldown("Sonda 48 930 ks"), null);
  assert.equal(C.cooldown("Vítězství! Úspěšně jsme loupili na planetě"), null);
  assert.equal(C.cooldown("Zaútočit na planetu: AVHF-6359-35 Zloděj 20 000 ks Možný odpor Špionážní 24 24"), null);
});

test("DOM counters distinguish remaining from maximum", () => {
  const link = {
    querySelector: () => ({ textContent: "7" }),
    childNodes: [{ nodeType: 3, textContent: "Zlodějský" }, { nodeType: 1 }, { nodeType: 3, textContent: "8" }]
  };
  assert.deepEqual(C.counters(link), { remaining: 7, maximum: 8 });
  link.querySelector = () => null;
  assert.deepEqual(C.counters(link), { remaining: null, maximum: 8 });
});

test("daily quota notice is exhausted, not a short cooldown", () => {
  const notice = "Dnes jste již vykradl zlodějským útokem maximální počet planet, počkejte do vojenského přepočtu, který máte v 22.00 hodin.";
  assert.equal(C.exhausted(notice), true);
  assert.equal(C.exhausted("Limit útoků byl vyčerpán."), true);
  assert.equal(C.exhausted("Vyčerpali jste denní limit útoků."), true);
  assert.equal(C.exhausted("Využívat zlodějského útoku můžete až za 7 sekund"), false);
  assert.equal(C.exhausted("Vaše rasa nemá tento útok vyzkoumaný!"), false);
  const doc = {
    URL: "https://stargame-online.cz/www/game.php",
    body: { cloneNode: () => ({ textContent: notice, querySelectorAll: () => [] }) },
    querySelector: () => null,
    querySelectorAll: selector => selector === ".hlaska" ? [{ textContent: notice }] : []
  };
  assert.deepEqual(C.response(doc), { kind: "exhausted", message: notice });
  const entry = C.attackPage(doc, "3", doc.URL);
  assert.equal(entry.remaining, 0);
  assert.equal(entry.available, false);
  assert.equal(entry.status.kind, "exhausted");
});

test("exhausted type does not block another selected type", () => {
  const plans = { 3: { enabled: false }, 7: { enabled: true } };
  assert.deepEqual(C.nextAttack(["3", "7"], plans, {}, 0, 0), { id: "7", cursor: 0 });
  plans[7].enabled = false;
  assert.equal(C.nextAttack(["3", "7"], plans, {}, 0, 0), null);
});

test("pacing uses bounded, nonconstant positive delays", () => {
  assert.equal(C.pacingDelay("between", () => 0), 2500);
  assert.equal(C.pacingDelay("between", () => 0.999999), 6000);
  assert.equal(C.pacingDelay("submit", () => 0), 1500);
  assert.equal(C.pacingDelay("submit", () => 0.999999), 4000);
  for (let i = 0; i < 100; i++) {
    const r = i / 100;
    assert.ok(C.pacingDelay("between", () => r) >= 2500 && C.pacingDelay("between", () => r) <= 6000);
    assert.ok(C.pacingDelay("submit", () => r) >= 1500 && C.pacingDelay("submit", () => r) <= 4000);
  }
});

test("add-on token field is not a login form, a real login field still stops", () => {
  const win = "V\u00edt\u011bzstv\u00ed!";
  const heading = { querySelector: () => ({ textContent: win }), textContent: win };
  const make = fields => ({
    URL: "https://stargame-online.cz/www/game.php?page=jednotky&akce=result",
    body: { cloneNode: () => ({ textContent: win, querySelectorAll: () => [] }) },
    querySelector: s => s === "#datapl" ? heading : null,
    querySelectorAll: s => s === 'input[type="password"]' ? fields : []
  });
  const own = { closest: s => s.includes("#sgo-addon") ? {} : null };
  assert.equal(C.response(make([own])).kind, "result");
  assert.equal(C.response(make([{ closest: () => null }])).kind, "stop");
});

test("readRefugeeTargets filters Vala and defectors with more than 1 planet, skips <=1 planet defectors and totals", () => {
  const rows = [
    // Header row
    { cells: ["#", "Jméno", "Planety", "Populace", "Síla", "Rozloha", "Dobyt", "Útoky", ""], attackUrls: [] },
    // Vala Mal Doran (always included)
    { cells: ["1.", "Vala Mal Doran", "81", "15 358", "958 160", "1 115 613", "8×", "", ""], attackUrls: ["game.php?page=jednotky&utok=2&cil=Vala Mal Doran"] },
    // mrk (> 1 planet, included)
    { cells: ["2.", "mrk", "4", "1 800", "0", "0", "1×", "", ""], attackUrls: ["game.php?page=jednotky&utok=2&cil=mrk"] },
    // DrErrorBekCZ (1 planet, excluded)
    { cells: ["3.", "DrErrorBekCZ", "1", "896", "24 000", "400", "0×", "nelze", ""], attackUrls: [] },
    // Simurgh (1 planet, excluded)
    { cells: ["4.", "Simurgh", "1", "943", "24 000", "400", "0×", "nelze", ""], attackUrls: [] },
    // Total row (empty rank, excluded)
    { cells: ["", "87", "18 997", "1 006 160", "1 116 413", "9×", ""], attackUrls: [] }
  ].map(({ cells, attackUrls }) => ({
    querySelectorAll: sel => sel === "td, th" ? cells.map((textContent, idx) => ({
      textContent,
      querySelector: subSel => idx === 1 && (subSel.includes("hledat=") || subSel === "a") ? {
        textContent,
        childNodes: [{ textContent }]
      } : null
    })) : (sel === 'a[href*="utok="]' ? attackUrls.map(href => ({ getAttribute: a => a === "href" ? href : null })) : [])
  }));

  const doc = { querySelectorAll: sel => sel === "table tr" ? rows : [] };
  const targets = C.readRefugeeTargets(doc);
  assert.equal(targets.length, 2);
  assert.equal(targets[0].name, "Vala Mal Doran");
  assert.equal(targets[0].planets, 81);
  assert.equal(targets[0].power, 958160);
  assert.equal(targets[0].attackable, true);
  assert.equal(targets[1].name, "mrk");
  assert.equal(targets[1].planets, 4);
  assert.equal(targets[1].power, 0);
  assert.equal(targets[1].attackable, true);
});

test("attackPage validates custom target matches form", () => {
  const makeDoc = targetName => ({
    URL: `https://stargame-online.cz/www/game.php?page=jednotky&utok=2&cil=${encodeURIComponent(targetName)}`,
    body: { cloneNode: () => ({ textContent: "", querySelectorAll: () => [] }) },
    querySelector: sel => {
      if (sel === "#formular") return {
        querySelector: sub => sub === '[name="zautocit"]' ? {} : null,
        querySelectorAll: sub => {
          if (sub === 'input[name^="pocet_"]') return [{
            name: "pocet_zlodej",
            closest: () => ({ textContent: "100 ks", querySelector: () => ({ textContent: "Zlodej" }) })
          }];
          if (sub === '[name="planeta2"] option') return [{ value: "QGUY-4237-76", textContent: "QGUY-4237-76" }];
          return [];
        }
      };
      if (sel === "#nepritele") return { textContent: targetName };
      return null;
    },
    querySelectorAll: sel => sel === "a.lowopacity" ? [{
      getAttribute: () => "game.php?page=jednotky&utok=2&cil=" + targetName,
      querySelector: () => ({ textContent: "12" }),
      childNodes: [{ nodeType: 3, textContent: "Partyzánský" }, { nodeType: 1 }, { nodeType: 3, textContent: "12" }]
    }] : []
  });

  const mrkDoc = makeDoc("mrk");
  const entryVala = C.attackPage(mrkDoc, "2", mrkDoc.URL, "Vala Mal Doran");
  assert.equal(entryVala.available, false, "Should be unavailable when target does not match expected");

  const entryMrk = C.attackPage(mrkDoc, "2", mrkDoc.URL, "mrk");
  assert.equal(entryMrk.available, true, "Should be available when target matches custom target");
  assert.equal(entryMrk.target, "mrk");
  assert.equal(entryMrk.planets.length, 1);
});