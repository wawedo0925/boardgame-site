const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261011060000_yutnori_game.sql"), "utf8");
const client = fs.readFileSync(path.join(root, "app/yut/YutClient.tsx"), "utf8");

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
