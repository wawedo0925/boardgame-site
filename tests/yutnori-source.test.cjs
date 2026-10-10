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
const hostRoomCleanupMigration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261011110000_yutnori_host_room_cleanup.sql",
  ),
  "utf8",
);
const randomStartMigration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261011120000_yutnori_random_start.sql",
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
  assert.match(client, /if \(nodeOf\(piece\) === 99\) continue/);
  assert.match(client, /if \(currentNode === 99\) return null/);
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

test("provides Tichu-style room chat in waiting and playing views", () => {
  assert.match(client, /function RoomChat/);
  assert.match(client, /supabase\.channel\(`yut:\$\{roomId\}`/);
  assert.match(client, /event: "chat"/);
  assert.match(client, /채팅창 투명도/);
  assert.match(client, /startDrag/);
  assert.match(client, /startResize/);
  assert.equal((client.match(/<RoomChat/g) ?? []).length, 2);
});

test("removes a host's previous room when leaving or creating another", () => {
  assert.match(
    hostRoomCleanupMigration,
    /delete from public\.yut_rooms where host_id=auth\.uid\(\)/,
  );
  assert.match(
    hostRoomCleanupMigration,
    /if h=auth\.uid\(\) then\s+delete from yut_rooms where id=p_room;\s+return;/,
  );
  assert.match(client, /snapRef\.current\?\.room\.host_id === userId/);
  assert.match(client, /rpc\("yut_leave_room", \{ p_room: roomId \}\)/);
});

test("shuffles the full player order for every new yut game", () => {
  assert.match(randomStartMigration, /order by random\(\)/);
  assert.match(randomStartMigration, /set seat=seat\+100/);
  assert.match(randomStartMigration, /set seat=s\.new_seat/);
  assert.match(randomStartMigration, /turn_seat=0/);
  assert.match(randomStartMigration, /finish_order='\{\}'/);
});
