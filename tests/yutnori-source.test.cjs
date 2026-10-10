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
const rematchMigration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261011130000_yutnori_rematch_ready.sql",
  ),
  "utf8",
);
const backdoFinishMigration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261011140000_yutnori_backdo_finish.sql",
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
  assert.match(client, /piece\.step_index === 0 && !piece\.back_at_start/);
  assert.match(client, /if \(currentNode === 99\) return null/);
  assert.match(client, /absolute left-1\/2 top-1\/2 z-50/);
  assert.doesNotMatch(client, /fixed left-1\/2 top-20 z-50/);
});

test("supports the house-rule back-do finish from the returned start spot", () => {
  assert.match(client, /back_at_start: boolean/);
  assert.match(client, /!p\.back_at_start/);
  assert.doesNotMatch(client, /움직일 말을 골라 주세요/);
  assert.match(backdoFinishMigration, /add column if not exists back_at_start/);
  assert.match(
    backdoFinishMigration,
    /mv<0 and pc\.step_index=0 and pc\.back_at_start/,
  );
  assert.match(backdoFinishMigration, /route2:='outer'; step2:=21/);
  assert.match(backdoFinishMigration, /back_at_start=returned_start/);
});

test("offers a replayable first-visit controls tutorial", () => {
  assert.match(client, /function YutTutorial/);
  assert.match(client, /yut-tutorial-seen/);
  assert.match(client, /aria-label="윷놀이 조작법"/);
  assert.match(client, /내 차례에 윷 던지기/);
  assert.match(client, /움직일 말 선택하기/);
  assert.match(client, /갈림길 방향 고르기/);
  assert.match(client, /우리 방의 빽도 규칙/);
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

test("requires every player to ready up before the host starts a rematch", () => {
  assert.match(rematchMigration, /function public\.yut_toggle_rematch/);
  assert.match(rematchMigration, /function public\.yut_start_rematch/);
  assert.match(rematchMigration, /not ready/);
  assert.match(rematchMigration, /set ready=is_bot/);
  assert.match(client, /action\("yut_toggle_rematch"\)/);
  assert.match(client, /action\("yut_start_rematch"\)/);
  assert.match(client, /모두 준비하면 시작 가능/);
});
