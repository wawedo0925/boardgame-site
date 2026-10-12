const fs=require('fs'),assert=require('node:assert/strict');const {PGlite}=require('../.local-reference/clocktower/test-runtime/node_modules/@electric-sql/pglite');
(async()=>{const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table profiles(id uuid,activity_name text);`);
for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.includes('yutnori')).sort()) {try{await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));}catch(e){throw Error(f+': '+e.message)}}
const ids=[1,2,3].map(n=>`10000000-0000-0000-0000-00000000000${n}`);for(const id of ids){await db.query('insert into auth.users values($1)',[id]);await db.query("insert into profiles values($1,'테스트')",[id])}
const login=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await login(ids[0]);const rid=(await db.query("select yut_create_room('심리전','PSYCHOLOGY',4) id")).rows[0].id;await login(ids[1]);await db.query('select yut_join_room($1)',[rid]);await db.query('select yut_toggle_ready($1)',[rid]);await login(ids[0]);await db.query('select yut_start_room($1)',[rid]);
const snap=async()=> (await db.query('select yut_snapshot($1) s',[rid])).rows[0].s;
for(let a=0;a<=2;a++)for(let b=0;b<=2;b++){
 await db.query("update yut_rooms set pending_moves='{}',can_roll=true where id=$1",[rid]);await db.query('update yut_pieces set step_index=3 where room_id=$1',[rid]);
 await login(ids[0]);let s=await snap();const round=s.room.mind_round;assert.equal(s.room.mode,'PSYCHOLOGY');assert.equal(s.room.max_players,2);
 await db.query('select yut_mind_choose($1,$2,$3)',[rid,round,a]);await db.query('select yut_mind_choose($1,$2,$3)',[rid,round,(a+1)%3]);
 await login(ids[1]);s=await snap();assert.equal(s.room.mind_my_choice,null);assert.equal(s.room.mind_selected.length,1);assert.equal(s.room.mind_round,round);
 await db.query('select yut_roll($1)',[rid]);assert.equal((await snap()).room.mind_round,round);
 await db.query('select yut_mind_choose($1,$2,$3)',[rid,round,b]);s=await snap();assert.equal(s.room.last_roll,[5,-1,2,3,4][a+b]);assert.equal(s.room.mind_reveal.length,2);assert.equal(s.room.mind_selected.length,0);assert.equal(s.room.mind_round,round+1);
 await assert.rejects(db.query('select yut_mind_choose($1,$2,0)',[rid,round]));
}
await login(ids[2]);assert.equal(await snap(),null);await assert.rejects(db.query('select yut_mind_choose($1,0,0)',[rid]));
assert.equal((await db.query("select has_table_privilege('authenticated','yut_mind_choices','select') p")).rows[0].p,false);
await login(ids[0]);await db.query("update yut_rooms set can_roll=true,pending_moves='{}' where id=$1",[rid]);await db.query('update yut_pieces set step_index=0,back_at_start=false where room_id=$1',[rid]);let s=await snap(),round=s.room.mind_round,seat=s.room.turn_seat;await db.query('select yut_mind_choose($1,$2,0)',[rid,round]);await login(ids[1]);await db.query('select yut_mind_choose($1,$2,1)',[rid,round]);s=await snap();assert.equal(s.room.turn_seat,(seat+1)%2);assert.deepEqual(s.room.pending_moves,[]);
// Capture still awards another secret selection; a normal result moves only the active team.
await db.query("update yut_rooms set can_roll=true,pending_moves='{}' where id=$1",[rid]);await login(ids[0]);s=await snap();const actor=s.players.find(p=>p.seat===s.room.turn_seat);await db.query('update yut_pieces set step_index=case when team=$2 then 3 else 5 end where room_id=$1',[rid,actor.team]);round=s.room.mind_round;await db.query('select yut_mind_choose($1,$2,1)',[rid,round]);await login(ids[1]);await db.query('select yut_mind_choose($1,$2,1)',[rid,round]);await login(actor.user_id);await db.query('select yut_move($1,0,1)',[rid]);s=await snap();assert.equal(s.room.can_roll,true);assert.equal(s.room.turn_seat,actor.seat);assert.ok(s.pieces.filter(p=>p.team!==actor.team).every(p=>p.step_index===0));assert.deepEqual(s.room.mind_selected,[]);
// Spend a later result first, preserve duplicates, and use selected results at junctions.
await login(actor.user_id);
await db.query("update yut_rooms set can_roll=false,pending_moves='{5,4,5,2}' where id=$1",[rid]);
await db.query("update yut_pieces set route='outer',step_index=0,back_at_start=false where room_id=$1",[rid]);
await db.query('select yut_move($1,0,4)',[rid]);s=await snap();
assert.deepEqual(s.room.pending_moves,[5,4,5]);
assert.equal(s.pieces.find(p=>p.team===actor.team&&p.piece_no===0).step_index,2);
await db.query('select yut_move($1,1,2)',[rid]);s=await snap();
assert.deepEqual(s.room.pending_moves,[5,5]);
assert.equal(s.pieces.find(p=>p.team===actor.team&&p.piece_no===1).step_index,4);
await db.query('select yut_move($1,2,2)',[rid]);assert.deepEqual((await snap()).room.pending_moves,[5]);
await db.query("update yut_rooms set pending_moves='{5,2}',can_roll=false where id=$1",[rid]);
await db.query("select yut_move_choice($1,2,2,'DIAGONAL')",[rid]);s=await snap();
assert.deepEqual(s.room.pending_moves,[5]);
assert.equal(s.pieces.find(p=>p.team===actor.team&&p.piece_no===2).route,'diag1');
assert.equal(s.pieces.find(p=>p.team===actor.team&&p.piece_no===2).step_index,7);
await db.query("update yut_rooms set pending_moves='{5,-1}',can_roll=false where id=$1",[rid]);
await db.query('select yut_move($1,0,2)',[rid]);s=await snap();
assert.deepEqual(s.room.pending_moves,[5]);
assert.equal(s.pieces.find(p=>p.team===actor.team&&p.piece_no===0).step_index,1);
await db.query("update yut_rooms set can_roll=true,pending_moves='{}' where id=$1",[rid]);
// A rematch removes unfinished secret choices and invalidates old selection IDs.
await login(ids[0]);s=await snap();round=s.room.mind_round;await db.query('select yut_mind_choose($1,$2,2)',[rid,round]);await db.query("update yut_rooms set status='FINISHED' where id=$1",[rid]);await db.query('update yut_players set ready=true where room_id=$1',[rid]);await db.query('select yut_start_rematch($1)',[rid]);s=await snap();assert.ok(s.room.mind_round>round);assert.deepEqual(s.room.mind_selected,[]);assert.equal(s.room.mind_reveal,null);
await login(ids[0]);const normal=(await db.query("select yut_create_room('일반','INDIVIDUAL',3) id")).rows[0].id;assert.equal((await db.query('select yut_snapshot($1) s',[normal])).rows[0].s.room.mode,'INDIVIDUAL');
// AI completes its independent choice on either player's turn.
const botRoom=(await db.query("select yut_create_room('AI','PSYCHOLOGY',2) id")).rows[0].id;await db.query('select yut_add_bot($1)',[botRoom]);await db.query('select yut_start_room($1)',[botRoom]);let bs=(await db.query('select yut_snapshot($1) s',[botRoom])).rows[0].s;await db.query('select yut_mind_choose($1,$2,2)',[botRoom,bs.room.mind_round]);bs=(await db.query('select yut_snapshot($1) s',[botRoom])).rows[0].s;assert.equal(bs.room.mind_reveal.length,2);assert.ok([2,3,4].includes(bs.room.last_roll));
await db.close();console.log('PASS all 9 combinations, hidden choices, locked choice, stale submits, back-do, nonmembers, permissions, normal mode');})().catch(e=>{console.error(e);process.exit(1)});
