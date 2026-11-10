const { test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lottery.js");
const draw = (at = "2026-11-04T08:00", numbers = [5, 8, 10, 22, 6, 7]) => ({ at, numbers });
const gist = draws => ({ files: { "draws.json": { content: JSON.stringify({ schemaVersion: 1, draws }) } } });
const config = { id: "a".repeat(32), token: "test-only" };

test("reads both visible draws without collecting player's bet or winning tiers", () => {
  const rows = L.readDraws("Super 6 Předposlední tažená čísla:\n04.11.2026 v 02:00\n23, 19, 4, 22, 8, 11\nPoslední tažená čísla: 04.11.2026 v 08:00 5, 8, 10, 22, 6, 7\n2 11 10 18 21 20 Počet slosování: 12");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { at: "2026-11-04T08:00", numbers: [5, 6, 7, 8, 10, 22] });
  assert.throws(() => L.readDraws("Super 6 1 2 3 4 5 6"), /nie sú čitateľné/);
});
test("reads separated inline labels, dates, times and comma-delimited balls without truncating extra numbers", () => {
  const rows = L.readDraws("Poslední tažená čísla\n:\n4. 11. 2026\nv\n08:00\n5\n,\n8\n,\n10\n,\n22\n,\n6\n,\n17");
  assert.deepEqual(rows[0], { at: "2026-11-04T08:00", numbers: [5, 6, 8, 10, 17, 22] });
  assert.throws(() => L.readDraws("Poslední tažená čísla: 4.11.2026 v 08:00 1,2,3,4,5,6,7"), /nie sú čitateľné/);
});
test("merges unordered duplicates, rejects conflicting results and malformed records", () => {
  assert.equal(L.merge([draw()], [draw(undefined, [22, 10, 8, 7, 6, 5])]).length, 1);
  assert.throws(() => L.merge([draw()], [draw(undefined, [1, 2, 3, 4, 5, 6])]), /Rozdielne/);
  for (const bad of [draw("2026-02-30T08:00"), draw(undefined, [1, 1, 2, 3, 4, 5]), draw(undefined, [1, 2]), draw(undefined, [0, 1, 2, 3, 4, 5])]) {
    assert.throws(() => L.merge([bad]));
  }
  assert.equal(L.gistId(`https://gist.github.com/user/${config.id}`), config.id);
  assert.throws(() => L.gistId("https://evil.example/"));
});
test("sync preserves remote draws, uploads union and verifies result", async () => {
  let remote = [draw("2026-11-04T02:00")];
  const calls = [];
  const result = await L.sync(config, [draw()], async (url, token, method = "GET", data) => {
    assert.equal(url, `https://api.github.com/gists/${config.id}`);
    calls.push(method);
    if (method === "PATCH") remote = JSON.parse(data.files["draws.json"].content).draws;
    return gist(remote);
  });
  assert.deepEqual(calls, ["GET", "PATCH", "GET"]);
  assert.equal(result.length, 2);
  let writes = 0;
  await L.sync(config, result, async (url, token, method) => { if (method) writes++; return gist(remote); });
  assert.equal(writes, 0);
});
test("failed or concurrent sync does not mutate local history or overwrite malformed Gist", async () => {
  const local = [draw()];
  const copy = structuredClone(local);
  let calls = 0;
  await assert.rejects(L.sync(config, local, async () => {
    calls++;
    return calls === 1 ? gist([]) : calls === 2 ? gist(local) : gist([]);
  }), /Súbežný/);
  assert.deepEqual(local, copy);
  await assert.rejects(L.sync(config, local, async () => ({ files: {} })), /draws.json/);
  await assert.rejects(L.sync({ ...config, token: "" }, local), /Chýba/);
  await assert.rejects(L.sync(config, local, async () => { throw new Error("Offline"); }), /Offline/);
});

test("Tampermonkey transport authenticates only to GitHub and reports HTTP failures without tokens", async () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const calls = [];
  let status = 200;
  const context = vm.createContext({ GM: { xmlHttpRequest(options) {
    calls.push(options);
    options.onload({ status, responseText: JSON.stringify(gist([])) });
  } } });
  vm.runInContext(fs.readFileSync(require.resolve("../lottery.js"), "utf8"), context);
  await context.SGOLottery.sync(config, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.github.com/gists/${config.id}`);
  assert.equal(calls[0].headers.Authorization, `Bearer ${config.token}`);
  assert.equal(calls[0].anonymous, true);
  assert.equal(calls[0].timeout, 20000);
  status = 401;
  await assert.rejects(context.SGOLottery.sync(config, []), error =>
    error.message.includes("401") && !error.message.includes(config.token));
});

test("statistical analysis and weighted/pure-random number selection", () => {
  const history = [
    draw("2026-11-04T02:00", [4, 8, 11, 19, 22, 23]),
    draw("2026-11-04T08:00", [5, 6, 7, 8, 10, 22]),
    draw("2026-11-04T14:00", [3, 8, 10, 15, 16, 22])
  ];
  const stats = L.analyze(history);
  assert.equal(stats.totalDraws, 3);
  assert.equal(stats.numbers.length, 25);
  assert.equal(stats.hot[0].number, 8);
  assert.equal(stats.hot[0].count, 3);
  assert.equal(stats.hot[1].number, 22);
  assert.equal(stats.hot[1].count, 3);

  let step = 0;
  const rolls = [0.01, 0.15, 0.3, 0.5, 0.7, 0.9];
  const weighted = L.pickNumbers(history, { pureRandom: false, random: () => rolls[step++ % rolls.length] });
  assert.equal(weighted.length, 6);
  assert.equal(new Set(weighted).size, 6);
  assert.deepEqual(weighted, [...weighted].sort((a, b) => a - b));

  step = 0;
  const uniform = L.pickNumbers(history, { pureRandom: true, random: () => rolls[step++ % rolls.length] });
  assert.equal(uniform.length, 6);
  assert.equal(new Set(uniform).size, 6);
  assert.notDeepEqual(weighted, uniform);
});

test("fillBetForm marks 6 balls, updates hidden input and cost without submitting", () => {
  const cells = {};
  const slots = {};
  for (let n = 1; n <= 25; n++) cells[`#vsaz-${n}`] = { className: "cislo-vsazeno" };
  for (let i = 1; i <= 6; i++) slots[`#los-${i}`] = { textContent: "99" };
  const hidden = { value: "01." };
  const drawsInput = { value: "12" };
  const cost = { textContent: "0" };
  const doc = {
    querySelector: selector => cells[selector] || slots[selector] ||
      (selector === "#cisla" ? hidden : selector === "#pocet-slos" ? drawsInput : selector === "#naq-del" ? cost : null)
  };
  const selected = L.fillBetForm(doc, [22, 6, 8, 19, 23, 15]);
  assert.deepEqual(selected, [6, 8, 15, 19, 22, 23]);
  assert.equal(hidden.value, "06.08.15.19.22.23.");
  assert.equal(cells["#vsaz-6"].className, "cislo-vsazeno");
  assert.equal(cells["#vsaz-1"].className, "");
  assert.equal(slots["#los-1"].textContent, "6");
  assert.equal(slots["#los-6"].textContent, "23");
  assert.equal(cost.textContent, "18000000");
  assert.throws(() => L.fillBetForm(doc, [1, 2, 3, 4, 5]), /Neplatná/);
  assert.throws(() => L.fillBetForm({ querySelector: () => null }, [1, 2, 3, 4, 5, 6]), /nie je na stránke/);
});
