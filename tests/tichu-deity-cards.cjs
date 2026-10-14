const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('../.local-reference/clocktower/test-runtime/node_modules/@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table profiles(id uuid primary key references auth.users,activity_name text,gender text,updated_at timestamptz default now());`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f=>f.includes('tichu')).sort())
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  const ids=[1,2,3,4].map(n=>`00000000-0000-0000-0000-00000000000${n}`);
  for(const id of ids) await db.query('insert into auth.users values($1)',[id]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[0]]);
  const room=(await db.query(`insert into tichu_rooms(code,title,host_id,game_mode) values('TEST','test',$1,'INDIVIDUAL') returning id`,[ids[0]])).rows[0].id;
  for(let i=0;i<4;i++) await db.query(`insert into tichu_players(room_id,user_id,seat,team,is_bot,bot_difficulty,ready)
    values($1,$2,$3,$4,$5,$6,true)`,[room,ids[i],i,i%2,i>0,i===1?'deity':'god']);
  // Exact bucket boundaries/counts on 100 equally spaced independent inputs.
  const counts=(await db.query(`select t[1] a,t[2] s,t[3] k,count(*)::int n from
    (select tichu_deity_card_targets(i/100.0,i/100.0,i/100.0) t from generate_series(0,99)i) x group by 1,2,3`)).rows;
  const count=(index,value)=>counts.filter(r=>r[index]===value).reduce((n,r)=>n+r.n,0);
  assert.deepEqual([count('a',0),count('a',1),count('a',2)],[60,30,10]);
  assert.deepEqual([count('s',0),count('s',54),count('s',55)],[90,5,5]);
  assert.deepEqual([count('k',-1),count('k',2),count('k',1)],[20,30,50]);
  let worst=0;
  for(const a of [0,1,2]) for(const s of [0,54,55]) for(const k of [-1,1,2]) {
    const started=Date.now();
    const deal=(await db.query('select tichu_make_deity_deal($1,$2,$3,$4) d',[room,a,s,k])).rows[0].d;
    worst=Math.max(worst,Date.now()-started);
    const hand=deal[ids[0]],boss=deal[ids[1]];
    assert.equal(new Set(Object.values(deal).flat()).size,56);
    for(const h of Object.values(deal)) assert.equal(h.length,14);
    assert.equal(hand.filter(c=>c>=48&&c<=51).length,a);
    assert.deepEqual(hand.filter(c=>c>=54).sort(),s?[s]:[]);
    if(k!==-1) assert.equal(hand.filter(c=>c>=44&&c<=47).length,k);
    assert(boss.slice(0,8).some(c=>c>=48&&c<=51));
    assert(boss.slice(0,8).filter(c=>c>=44&&c<=47).length>=2);
    assert.equal((await db.query('select tichu_hand_has_bomb($1) or tichu_hand_has_straight($1) bad',[hand])).rows[0].bad,false);
  }
  // Full start -> declaration -> exchange for consecutive rounds. The already
  // revealed eight cards must survive; the private reservation must disappear.
  for(let round=0;round<8;round++) {
    if(round) await db.query("update tichu_rooms set status='ROUND_END' where id=$1",[room]);
    await db.query('update tichu_players set ready=true where room_id=$1',[room]);
    await db.query('select tichu_start_room($1)',[room]);
    const first=(await db.query('select user_id,initial_cards from tichu_hands where room_id=$1',[room])).rows;
    const reservation=(await db.query('select hands from tichu_deity_pending_deals where room_id=$1',[room])).rows[0].hands;
    const snap=(await db.query('select tichu_snapshot($1) s',[room])).rows[0].s;
    assert.equal(snap.room.hands,undefined);
    assert.equal(snap.me.cards.length,8);
    await db.query('select tichu_bot_tick($1)',[room]);
    await db.query('select tichu_grand_choice($1,$2)',[room,round%2===0]);
    assert.equal((await db.query('select status from tichu_rooms where id=$1',[room])).rows[0].status,'EXCHANGE');
    const full=(await db.query('select user_id,cards from tichu_hands where room_id=$1',[room])).rows;
    for(const h of full) {
      assert.deepEqual([...h.cards].sort((a,b)=>a-b),[...reservation[h.user_id]].sort((a,b)=>a-b));
      assert(first.find(x=>x.user_id===h.user_id).initial_cards.every(c=>h.cards.includes(c)));
    }
    assert.equal((await db.query('select count(*)::int n from tichu_deity_pending_deals where room_id=$1',[room])).rows[0].n,0);
    const gifts=full.find(h=>h.user_id===ids[0]).cards.filter(c=>c<44).slice(0,3);
    for(let i=0;i<3;i++) await db.query('select tichu_give_card($1,$2,$3)',[room,ids[i+1],gifts[i]]);
    await db.query('select tichu_bot_tick($1)',[room]);
    assert.equal((await db.query('select status from tichu_rooms where id=$1',[room])).rows[0].status,'PLAYING');
  }
  assert.equal((await db.query('select tichu_deity_name() n')).rows[0].n,'티츄신');
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from tichu_deity_pending_deals'),/permission denied/);
  await assert.rejects(db.query('select tichu_make_deity_deal($1,2,55,2)',[room]),/permission denied/);
  await db.close();
  console.log(`PASS: exact probability buckets; all 27 A/special/K combinations; 56 unique cards; 8 rounds; private deal; name reset. Slowest deal ${worst}ms`);
})().catch(e=>{console.error(e.message,e.where||'',e.stack);process.exit(1)});
