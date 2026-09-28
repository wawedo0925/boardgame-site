const fs=require("fs");
const {PGlite}=require("../.local-reference/clocktower/test-runtime/node_modules/@electric-sql/pglite");
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table public.profiles(id uuid primary key references auth.users,activity_name text,gender text);`);
 await db.exec(fs.readFileSync("supabase/migrations/20260928020000_tichu_rooms.sql","utf8"));
 await db.exec(fs.readFileSync("supabase/migrations/20260929010000_tichu_full_game.sql","utf8"));
 await db.exec(fs.readFileSync("supabase/migrations/20260929020000_tichu_round_end_hotfix.sql","utf8"));
 const ids=[1,2,3,4].map(n=>`00000000-0000-0000-0000-00000000000${n}`);
 for(let i=0;i<4;i++)await db.exec(`insert into auth.users values('${ids[i]}');insert into profiles values('${ids[i]}','멤버${i+1}','${i%2?'여':'남'}')`);
 const as=async(i,sql)=>{await db.exec(`select set_config('request.jwt.claim.sub','${ids[i]}',false)`);return db.query(sql)};
 const room=(await as(0,`select public.tichu_create_room(null,1000,15) id`)).rows[0].id;
 for(let i=1;i<4;i++)await as(i,`select public.tichu_join_room('${room}'::uuid)`);
 for(let i=0;i<4;i++)await as(i,`select public.tichu_toggle_ready('${room}')`);
 await as(0,`select public.tichu_start_room('${room}')`);
 let state=(await db.query(`select status,(select min(cardinality(cards)) from tichu_hands) cards from tichu_rooms where id='${room}'`)).rows[0];
 if(state.status!=="GRAND"||Number(state.cards)!==8)throw new Error("8-card grand phase failed");
 for(let i=0;i<4;i++)await as(i,`select public.tichu_grand_choice('${room}',false)`);
 state=(await db.query(`select status,(select min(cardinality(cards)) from tichu_hands) cards from tichu_rooms where id='${room}'`)).rows[0];
 if(state.status!=="EXCHANGE"||Number(state.cards)!==14)throw new Error("14-card exchange phase failed");
 const hands=(await db.query(`select user_id,cards from tichu_hands where room_id='${room}' order by user_id`)).rows;
 for(let i=0;i<4;i++){const targets=ids.filter(x=>x!==ids[i]);for(let j=0;j<3;j++)await as(i,`select public.tichu_give_card('${room}','${targets[j]}',${hands[i].cards[j]})`)}
 state=(await db.query(`select status,(select min(cardinality(cards)) from tichu_hands) cards from tichu_rooms where id='${room}'`)).rows[0];
 if(state.status!=="PLAYING"||Number(state.cards)!==14)throw new Error("one-card exchange failed");
 await db.exec(`delete from tichu_finished where room_id='${room}';insert into tichu_finished(room_id,user_id,finish_order) values('${room}','${ids[0]}',1),('${room}','${ids[1]}',2),('${room}','${ids[2]}',3);update tichu_hands set cards=case when user_id='${ids[3]}' then array[12] else '{}'::int[] end where room_id='${room}';update tichu_rooms set round_no=1 where id='${room}';select public.tichu_end_round('${room}')`);
 state=(await db.query(`select status,jsonb_array_length(round_history) history from tichu_rooms where id='${room}'`)).rows[0];
 if(state.status!=="ROUND_END"||Number(state.history)!==1)throw new Error("round-end scoring failed");
 console.log("PASS: Tichu teams, ready, 8+6 deal, exchange and round-end scoring");await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
