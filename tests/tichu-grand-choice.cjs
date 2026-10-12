const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('../.local-reference/clocktower/test-runtime/node_modules/@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table profiles(id uuid primary key references auth.users,activity_name text,gender text,updated_at timestamptz default now());`);
  const migration = '20261013010000_tichu_grand_handicap_scope.sql';
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.includes('tichu') && f < migration).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  const ids = [1, 2, 3, 4].map(n => `00000000-0000-0000-0000-00000000000${n}`);
  for (const id of ids) await db.query('insert into auth.users values($1)', [id]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[0]]);
  let serial = 0;
  async function setup(difficulty = 'beginner', mode = 'TEAM', bonus = null) {
    const room = (await db.query(`insert into tichu_rooms(code,title,host_id,game_mode,status,deity_human_bonus)
      values($1,'regression',$2,$3,'GRAND',$4) returning id`, [String(++serial), ids[0], mode, bonus])).rows[0].id;
    const human = bonus ? [0, 5, 10, 15, 20, 25, 30, bonus === 'power_one' ? 55 : 44] : [0, 13, 18, 21, 29, 40, 48, 55];
    const boss = bonus ? [48, 45, 46, 1, 6, 11, 16, 22] : null;
    const rest = Array.from({ length: 56 }, (_, i) => i).filter(c => !human.includes(c) && !boss?.includes(c));
    const openings = [human, boss || rest.splice(0, 8), rest.splice(0, 8), rest.splice(0, 8)];
    for (let i = 0; i < 4; i++) {
      await db.query(`insert into tichu_players(room_id,user_id,seat,team,is_bot,bot_difficulty)
        values($1,$2,$3,$4,$5,$6)`, [room, ids[i], i, i % 2, i > 0, i === 1 ? difficulty : 'beginner']);
      await db.query('insert into tichu_hands(room_id,user_id,cards,initial_cards) values($1,$2,$3,$3)', [room, ids[i], openings[i]]);
    }
    return { room, openings };
  }
  const original = (await db.query("select pg_get_functiondef('tichu_apply_god_opening_handicap()'::regprocedure) fn")).rows[0].fn;
  // The old condition is impossible for the screenshot's A + Dragon opening.
  // Bound the old loop only in this isolated database to reproduce promptly.
  await db.exec(original.replace('attempt >= 20000', 'attempt >= 3'));
  const broken = await setup();
  await db.query('select tichu_bot_tick($1)', [broken.room]);
  await assert.rejects(db.query('select tichu_grand_choice($1,false)', [broken.room]), /14장 배분/);
  assert.equal((await db.query('select grand_choice from tichu_players where room_id=$1 and user_id=$2', [broken.room, ids[0]])).rows[0].grand_choice, null);
  await db.exec(original);
  await db.exec(fs.readFileSync(`supabase/migrations/${migration}`, 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261013020000_tichu_server_clock.sql', 'utf8'));
  const synced = (await db.query('select tichu_snapshot($1) state', [broken.room])).rows[0].state;
  assert(Number.isFinite(Date.parse(synced.server_time)), 'snapshot supplies server clock');
  assert.equal(synced.me.user_id, ids[0], 'snapshot member access preserved');

  async function finish(fixture, call, botLast, bonus = null, god = false) {
    const { room, openings } = fixture;
    if (!botLast) await db.query('select tichu_bot_tick($1)', [room]);
    await db.query('select tichu_grand_choice($1,$2)', [room, call]);
    if (botLast) await db.query('select tichu_bot_tick($1)', [room]);
    assert.equal((await db.query('select status from tichu_rooms where id=$1', [room])).rows[0].status, 'EXCHANGE');
    const hands = (await db.query('select cards from tichu_hands where room_id=$1 order by user_id', [room])).rows.map(h => h.cards);
    assert.equal(new Set(hands.flat()).size, 56);
    hands.forEach((h, i) => { assert.equal(h.length, 14); assert(openings[i].every(c => h.includes(c))); });
    assert.equal((await db.query('select grand_called from tichu_players where room_id=$1 and user_id=$2', [room, ids[0]])).rows[0].grand_called, call);
    for (const h of hands.slice(1)) assert(h.filter(c => c < 36 || c === 52 || c === 53).length >= 3);
    if (god) assert.equal((await db.query('select tichu_god_safe_hand($1) ok', [hands[0]])).rows[0].ok, true);
    if (bonus) {
      assert.equal(hands[0].filter(c => (c >= 48 && c <= 51) || c >= 54).length, bonus === 'power_one' ? 1 : 0);
      if (bonus !== 'power_one') assert.equal(hands[0].filter(c => c >= 44 && c <= 47).length, bonus === 'king_pair' ? 2 : 1);
      assert(hands[1].some(c => c >= 48 && c <= 51));
      assert(hands[1].filter(c => c >= 44 && c <= 47).length >= 2);
    }
  }
  // A room already stuck before the migration can proceed without a restart.
  await finish(broken, false, false);
  for (const mode of ['TEAM', 'INDIVIDUAL']) for (const difficulty of ['beginner', 'advanced', 'god']) {
    for (const botLast of [false, true]) await finish(await setup(difficulty, mode), botLast, botLast, null, difficulty === 'god');
  }
  for (const bonus of ['power_one', 'king_pair', 'king_one']) await finish(await setup('deity', 'INDIVIDUAL', bonus), false, false, bonus, true);
  await db.close();
  console.log('PASS: reproduced old failure; stuck room recovery; both declaration choices/orderings/modes; A+Dragon retained; 56 unique cards; God/Deity restrictions preserved');
})().catch(e => { console.error(e.message, e.where || '', e.stack); process.exit(1); });
