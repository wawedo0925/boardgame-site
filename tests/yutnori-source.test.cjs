const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261011060000_yutnori_game.sql"),
  "utf8",
);
const client = fs.readFileSync(
  path.join(root, "app/yut/YutClient.tsx"),
  "utf8",
);
const finishOrderMigration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261011100000_yutnori_finish_order.sql",
  ),
  "utf8",
);

test("supports every requested player mode", () => {
  for (const mode of ["INDIVIDUAL", "TEAM_2V2", "TEAM_3X2"]) {
    assert.match(migration, new RegExp(mode));
    assert.match(client, new RegExp(mode));
  }
  assert.match(migration, /greatest\(2,least\(4,p_max_players\)\)/);
});

test("implements core yut rules and server-side bots", () => {
  assert.match(migration, /result in \(4,5\)/);
  assert.match(migration, /captured or r\.can_roll/);
  assert.match(migration, /public\.yut_node\(route,step_index\)=node0/);
  assert.match(migration, /create function public\.yut_bot_tick/);
  assert.match(migration, /result=-1 and not exists/);
});

test("shows board-centered notices and animates pieces across route nodes", () => {
  assert.match(client, /function movementNodes/);
  assert.match(client, /function AnimatedYutPiece/);
  assert.match(client, /transition-\[left,top\]/);
  assert.match(client, /absolute left-1\/2 top-1\/2 z-50/);
  assert.doesNotMatch(client, /fixed left-1\/2 top-20 z-50/);
});

test("continues play until only the last-place team remains", () => {
  assert.match(finishOrderMigration, /add column if not exists finish_order/);
  assert.match(finishOrderMigration, /new\.status:='PLAYING'/);
  assert.match(finishOrderMigration, /not \(p\.team=any\(ordered_teams\)\)/);
  assert.match(finishOrderMigration, /ordered_teams\[1\]/);
  assert.match(client, /최종 순위/);
  assert.match(client, /마지막 한 팀을 제외한 모든 팀이 완주했습니다/);
});
