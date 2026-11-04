const { test } = require("node:test");
const assert = require("node:assert/strict");
const S = require("../sectors.js");
const sector = (id, name, counts) => ({ id, name, races: Object.entries(counts).map(([race, count]) => ({ race, count })) });

test("only strict leaders, sorted by smallest margin, including refugees", () => {
  const rows = S.leaders([
    sector(1, "Safe", { Terrané: 30, Uprchlíci: 2 }),
    sector(2, "Auralis", { Origani: 25, Terrané: 26, Uprchlíci: 5 }),
    sector(3, "Tie", { Terrané: 10, Origani: 10 }),
    sector(4, "Lost", { Terrané: 9, Origani: 10 }),
    sector(5, "Refugees", { Terrané: 5, Uprchlíci: 6 }),
    sector(6, "Only ours", { Terrané: 3 })
  ], "Terrané");
  assert.deepEqual(rows.map(r => [r.name, r.difference]), [["Auralis", 1], ["Only ours", 3], ["Safe", 28]]);
  assert.equal(rows[0].rivals, "Origani");
});

test("all equally strong rivals shown with stable tie sorting", () => {
  const rows = S.leaders([sector(2, "Beta", { Terrané: 10, Gallú: 8, Origani: 8 }), sector(1, "Alfa", { Terrané: 4, Origani: 2 })], "Terrané");
  assert.deepEqual(rows.map(r => r.name), ["Alfa", "Beta"]);
  assert.equal(rows[1].rivals, "Gallú, Origani");
  assert.deepEqual(S.leaders([], "Terrané"), []);
});

test("closest sectors include ties then smallest deficits, never current leaders", () => {
  const sectors = [
    sector(1, "Leading", { Terrané: 20, Origani: 19 }),
    sector(2, "Far", { Terrané: 2, Origani: 30 }),
    sector(3, "Near", { Terrané: 9, Origani: 10, Gallú: 10 }),
    sector(4, "Tie", { Terrané: 10, Uprchlíci: 10 }),
    sector(5, "Empty", { Terrané: 0 })
  ];
  const near = S.closest(sectors, "Terrané");
  assert.deepEqual(near.map(r => [r.name, r.difference]), [["Tie", 0], ["Near", -1]]);
  assert.equal(near[1].rivals, "Gallú, Origani");
  const draft = S.forumDraft({ race: "Terrané", rows: S.leaders(sectors, "Terrané"), nearby: near, time: "today" });
  assert.equal(draft.rows, 1);
  assert.ok(draft.code.includes("Leading"));
  for (const name of ["Tie", "Near", "Far"]) assert.ok(!draft.code.includes(name));
});

test("closest sectors have stable tie order and handle fewer than two candidates", () => {
  const sectors = [sector(3, "Beta", { Terrané: 5, Origani: 6 }),
    sector(2, "Alfa", { Terrané: 5, Origani: 6 }), sector(1, "Alfa", { Terrané: 5, Origani: 6 })];
  assert.deepEqual(S.closest(sectors, "Terrané").map(r => r.id), [1, 2]);
  assert.equal(S.closest([sector(1, "No presence", { Origani: 1 })], "Terrané")[0].own, 0);
  assert.equal(S.closest(sectors.slice(0, 1), "Terrané").length, 1);
  assert.deepEqual(S.closest([], "Terrané"), []);
  assert.deepEqual(S.closest([sector(1, "Ours", { Terrané: 3 })], "Terrané"), []);
});

test("BBCode uses supported table tags, timestamp and no injectable tags", () => {
  const rows = S.leaders([sector(34, "Auralis", { Terrané: 26, Origani: 25 })], "Terrané");
  const code = S.bbcode({ race: "Terrané", rows, time: "3. 11. 2026 10:00" });
  assert.ok(code.includes("[table][tr][th]Sektor[/th]"));
  assert.ok(code.includes("[td]Auralis (34)[/td][td]26[/td][td]Origani[/td][td]25[/td][td]+1[/td]"));
  assert.ok(code.includes("3. 11. 2026 10:00"));
  assert.ok(!code.includes("Náskok ="));
  assert.ok(!code.includes("podmienka sektorovej odmeny"));
  assert.ok(!S.bbcode({ race: "[url=bad]", rows: [], time: "today" }).includes("[url="));
  assert.ok(S.bbcode({ race: "Terrané", rows: [], time: "today" }).includes("žiadnom sektore"));
});

test("forum draft retains report time, row count and BBCode", () => {
  const report = { race: "Terrané", rows: S.leaders([sector(34, "Auralis", { Terrané: 26, Origani: 25 })], "Terrané"), time: "3. 11. 2026 10:00" };
  const draft = S.forumDraft(report);
  assert.equal(draft.title, "Sektory – Terrané – 3. 11. 2026 10:00");
  assert.equal(draft.code, S.bbcode(report));
  assert.equal(draft.rows, 1);
  assert.equal(S.forumDraft({ ...report, rows: [] }).rows, 0);
});

test("prefill only targets leadership forum and rejects invalid stored drafts", () => {
  assert.equal(S.isForum("https://stargame-online.cz/www/game.php?forum=4&page=forum"), true);
  for (const query of ["page=forum&forum=5", "page=vesmir&forum=4", "page=forum"]) {
    assert.equal(S.isForum(`https://stargame-online.cz/www/game.php?${query}`), false);
  }
  for (const draft of [null, {}, { title: "Test", code: "", rows: 0 }, { title: "Test", code: "text", rows: -1 }]) {
    assert.throws(() => S.fillForumDraft({}, draft), /neplatné/);
  }
});
