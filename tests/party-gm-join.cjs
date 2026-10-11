const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.local-reference/clocktower/test-runtime/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,activity_name text);
 create table events(id uuid primary key,event_kind text,started_at timestamptz,ended_at timestamptz);
 create table event_participants(event_id uuid,user_id uuid,game_preference text,game_preference_updated_at timestamptz,primary key(event_id,user_id));
 create table event_waitlist(event_id uuid,user_id uuid,primary key(event_id,user_id));
 create table event_groups(id uuid primary key default gen_random_uuid(),event_id uuid,name text not null,position integer,created_by uuid not null,rule_master_user_id uuid);
 create table event_group_members(group_id uuid,user_id uuid,position integer,primary key(group_id,user_id));
 create function join_event_with_capacity(e uuid) returns text language plpgsql as $$begin
 if current_setting('test.closed',true)='yes' then raise exception 'closed';end if;
 if exists(select 1 from event_participants where event_id=e and user_id=auth.uid()) then return 'JOINED';end if;
 if current_setting('test.wait',true)='yes' then insert into event_waitlist values(e,auth.uid()) on conflict do nothing;return 'WAITLISTED';end if;
 insert into event_participants(event_id,user_id) values(e,auth.uid());return 'JOINED';end$$;`);
 const e='20000000-0000-0000-0000-000000000001',ids=[1,2,3,4].map(n=>`10000000-0000-0000-0000-00000000000${n}`);
 await db.query("insert into events values($1,'BOARDGAME',now(),now()+interval '3 hours')",[e]);
 for(const id of ids){await db.query('insert into auth.users values($1)',[id]);await db.query("insert into profiles values($1,'우영 / 89 / 광진')",[id]);}
 for(const f of ['20260921010000_event_arrival.sql','20261011150000_boardgame_party_gm_join.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec("alter table events add column created_by uuid;create table push_settings(id boolean,recipient_id uuid);create table notifications(recipient_id uuid,type text,title text,message text);create function create_member_notification(uuid,text,text,text,text,text) returns void language sql as $$insert into notifications values($1,$2,$3,$4)$$;");
 const notificationSource=fs.readFileSync('supabase/migrations/20260908020000_participant_push.sql','utf8');
 await db.exec(notificationSource.slice(notificationSource.indexOf('create function public.event_notification_label'),notificationSource.indexOf('-- Update only')));
 await db.exec(fs.readFileSync('supabase/migrations/20260921020000_murder_late_notification.sql','utf8'));
 for(let i=0;i<2;i++)await db.exec(fs.readFileSync('supabase/migrations/20261011160000_party_gm_join_notification.sql','utf8'));
 await db.query('update events set created_by=$1',[ids[3]]);
 await db.exec('create trigger notify_participation after insert or delete on event_participants for each row execute function notify_event_participation()');
 const login=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 const join=()=>db.query('select join_event_party_gm($1) result',[e]);
 const count=async(table)=>Number((await db.query('select count(*) n from '+table)).rows[0].n);
 await login('');await assert.rejects(join,/로그인/);
 await login(ids[0]);await join();await join();assert.equal(await count('event_groups'),1);assert.equal(await count('event_group_members'),1);
 assert.equal((await db.query('select * from notifications')).rows[0].title,'GM으로 참가');
 assert.equal((await db.query('select * from notifications')).rows[0].type,'EVENT_JOINED');
 assert.equal(await count('notifications'),1,'duplicate join emits no extra notification');
 const g=(await db.query('select * from event_groups')).rows[0];assert.equal(g.name,'우영 조');assert.equal(g.rule_master_user_id,ids[0]);assert.equal((await db.query('select * from event_participants')).rows[0].game_preference,'PREMADE_PARTY');assert.equal((await db.query('select * from event_arrival_plans')).rows[0].arrival_at,null);
 await db.exec("update events set event_kind='MURDER_MYSTERY'");await login(ids[1]);await assert.rejects(join,/보드게임/);await db.exec("update events set event_kind='BOARDGAME';set test.closed='yes'");await assert.rejects(join,/closed/);assert.equal(await count('event_party_gm_requests'),1);await db.exec("set test.closed='no';set test.wait='yes'");
 assert.equal((await join()).rows[0].result,'WAITLISTED');assert.equal(await count('event_groups'),1);
 // Promotion works even when a legacy operator flow deletes waitlist first.
 await db.exec('begin');await db.query('delete from event_waitlist where user_id=$1',[ids[1]]);await db.query('insert into event_participants(event_id,user_id) values($1,$2)',[e,ids[1]]);await db.exec('commit');assert.equal(await count('event_groups'),2);assert.equal(await count('event_party_gm_requests'),2);
 assert.equal((await db.query("select count(*) n from notifications where title='GM으로 참가'")).rows[0].n,2,'promotion announces GM');
 await login(ids[2]);await join();await db.query('delete from event_waitlist where user_id=$1',[ids[2]]);assert.equal(await count('event_party_gm_requests'),2);
 await db.exec("set test.wait='no'");await db.query('select join_event_with_arrival($1)',[e]);assert.equal(await count('event_groups'),2,'normal rejoin after waitlist cancellation creates no group');
 await db.query('delete from event_participants where user_id=$1',[ids[0]]);assert.equal((await db.query('select rule_master_user_id from event_groups where id=$1',[g.id])).rows[0].rule_master_user_id,null);assert.equal(await count('event_group_members'),1);
 assert.equal((await db.query("select count(*) n from notifications where title='참가 취소'")).rows[0].n,1);
 assert.equal((await db.query("select count(*) n from notifications where title='새 참가자'")).rows[0].n,1,'normal join unchanged');
 // Group insert failure rolls participation and intent back together.
 await login(ids[3]);await db.exec("alter table event_groups add constraint fail_test check (name<>'우영 조') not valid");await assert.rejects(join);assert.equal((await db.query('select count(*) n from event_participants where user_id=$1',[ids[3]])).rows[0].n,0);
 assert.equal((await db.query("select has_function_privilege('authenticated','apply_event_party_gm(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 await db.close();console.log('PASS: party GM atomic join, self assignment, duplicate prevention, waitlist promotion/cancellation, normal joins, rollback and private helper permissions');
})().catch(e=>{console.error(e);process.exit(1)});
