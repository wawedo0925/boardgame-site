const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{
 const db=new PGlite(); const [u,admin,e]=[1,2,3].map(i=>`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`);
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table events(id uuid primary key,started_at timestamptz,ended_at timestamptz,event_kind text,created_by uuid);
 create table event_participants(event_id uuid,user_id uuid);create table event_waitlist(event_id uuid,user_id uuid);
 create table profiles(id uuid primary key,activity_name text);create table push_settings(id boolean,recipient_id uuid);
 create table notifications(recipient_id uuid,type text,title text,message text);
 create function create_member_notification(uuid,text,text,text,text,text) returns void language sql as $$insert into notifications values($1,$2,$3,$4)$$;
 create function join_event_with_capacity(p_event_id uuid) returns text language plpgsql as $$begin
 if current_setting('test.fail',true)='yes' then raise exception 'join failed';end if;
 insert into event_participants values(p_event_id,auth.uid());return 'JOINED';end$$;
 insert into auth.users values('${u}'),('${admin}');insert into profiles values('${u}','테스트멤버');
 insert into events values('${e}','2026-09-21 18:00+09','2026-09-21 23:00+09','MURDER_MYSTERY','${admin}');
 set request.jwt.claim.sub='${u}';`);
 const original=fs.readFileSync('supabase/migrations/20260908020000_participant_push.sql','utf8');
 await db.exec(original.slice(original.indexOf('create function public.event_notification_label'),original.indexOf('-- Update only the former')));
 await db.exec(`create trigger notify_join after insert or delete on event_participants for each row execute function notify_event_participation()`);
 await db.exec(fs.readFileSync('supabase/migrations/20260921010000_event_arrival.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260921020000_murder_late_notification.sql','utf8'));
 const join=async(time,mode='NORMAL')=>{await db.exec('delete from notifications');await db.query(`select join_event_with_arrival($1,$2,$3)`,[e,time,mode]);return(await db.query('select * from notifications')).rows;};
 let n=await join('2026-09-21 18:05+09');assert.equal(n.length,1);assert.equal(n[0].title,'늦참 · 새 참가자');assert.match(n[0].message,/늦참 · 18:05 도착 예정/);assert.equal(n[0].recipient_id,admin);
 for(const time of [null,'2026-09-21 18:00+09']){n=await join(time);assert.equal(n[0].title,'새 참가자');assert.ok(!n[0].message.includes('늦참'));}
 for(const kind of ['BOARDGAME','GENERAL','HOLDEM','CLOCKTOWER']){await db.query('update events set event_kind=$1',[kind]);n=await join('2026-09-21 18:05+09',kind==='CLOCKTOWER'?'CLOCKTOWER_NEW':'NORMAL');assert.equal(n[0].title,'새 참가자');assert.ok(!n[0].message.includes('늦참'));}
 await db.exec("update events set event_kind='MURDER_MYSTERY'");await join('2026-09-21 18:10+09');
 await db.exec("set test.fail='yes'");await assert.rejects(join(null));assert.ok((await db.query('select arrival_at from event_arrival_plans')).rows[0].arrival_at,'failed join rolls back arrival change');
 await db.exec('delete from event_participants');n=(await db.query('select * from notifications')).rows;assert.ok(n.every(x=>x.title==='참가 취소'),'cancellation unchanged');
 console.log('PASS: murder-only late marker and time, existing admin recipient, normal/exact-start/other events unchanged, rollback, cancellation');await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
