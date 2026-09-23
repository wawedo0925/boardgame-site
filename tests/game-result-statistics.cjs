const assert=require('node:assert/strict'),fs=require('fs');
const {PGlite}=require(process.env.PGLITE_MODULE);
(async()=>{const db=new PGlite();await db.exec(`create role authenticated;create table event_game_sessions(id int,game_id uuid);create table event_game_rounds(id int,session_id int);create table event_round_players(round_id int,score numeric,is_gm bool,team_name text,is_winner bool);insert into event_game_sessions values(1,'00000000-0000-0000-0000-000000000001');insert into event_game_rounds select x,1 from generate_series(1,8) x;insert into event_round_players values
(1,-10,false,null,null),(1,30,false,null,null),(1,999,true,null,null),
(2,null,false,'선의 세력',true),(2,null,false,'선의 세력',true),(2,null,false,'악의 세력',false),
(3,null,false,'선의 세력',false),(3,null,false,'악의 세력',true),
(4,null,false,'선의 세력',true),(4,null,false,'악의 세력',null),
(5,null,false,'협력 팀',true),(5,null,false,'협력 팀',true),
(6,null,false,'협력 팀',false),
(7,null,false,'반협력 플레이어',true),(7,null,false,'반협력 배신자',false),
(8,null,false,'협력 팀',null);`);await db.exec(fs.readFileSync('supabase/migrations/20260923010000_game_result_statistics.sql','utf8'));
const query=()=>db.query(`select * from get_game_result_statistics(array['00000000-0000-0000-0000-000000000001'::uuid,'00000000-0000-0000-0000-000000000002'::uuid]) order by game_id`);
let {rows}=await query();assert.equal(Number(rows[0].average_score),10);assert.equal(Number(rows[0].high_score),30);assert.equal(Number(rows[0].score_count),2);assert.equal(Number(rows[0].role_count),2);assert.equal(Number(rows[0].good_rate),50);assert.equal(Number(rows[0].evil_rate),50);assert.equal(Number(rows[0].coop_count),3);assert.equal(Number(rows[0].success_rate),66.7);assert.equal(rows[1].success_rate,null);assert.equal(Number(rows[1].score_count),0);
await db.exec('delete from event_round_players where round_id=3');rows=(await query()).rows;assert.equal(Number(rows[0].good_rate),100);
await db.exec('set role authenticated');assert.equal((await query()).rows.length,2);
console.log('PASS: negative scores, GM exclusion, per-round weighting, incomplete outcomes, semi-coop, empty history, deletion refresh and member access');await db.close()})().catch(e=>{console.error(e);process.exitCode=1});
