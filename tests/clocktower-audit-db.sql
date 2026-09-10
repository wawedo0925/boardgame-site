-- Owner-only integration audit; all fixtures and mutations roll back.
begin;
create temporary table audit_context(eid uuid,rid uuid);
create function pg_temp.audit_action(action text,extra jsonb default '{}') returns void language plpgsql as $$
declare c record;r public.clocktower_live_rooms;
begin
 select * into c from audit_context;select * into r from public.clocktower_live_rooms where id=c.rid;
 perform public.clocktower_live_command(c.eid,action,jsonb_build_object('room_id',r.id,'version',r.engine_version,'revision',r.flow_revision,'state',r.night_engine)||extra);
end $$;
do $$
declare u uuid[];eid uuid;rid uuid;role text;state integer;source_state integer;bad boolean;n integer;engine jsonb;s jsonb;qid uuid;v integer;blocked boolean;
begin
 select array_agg(id) into u from (select id from auth.users order by id limit 8)x;assert cardinality(u)=8;
 select e.id into eid from public.events e where not exists(select 1 from public.clocktower_live_rooms r where r.event_id=e.id and r.phase<>'ENDED') limit 1;assert eid is not null;
 perform pg_advisory_xact_lock(hashtextextended(eid::text,0));
 insert into public.clocktower_live_rooms(event_id,storyteller_id,phase,night,roles_released) values(eid,u[1],'NIGHT',2,true) returning id into rid;
 insert into audit_context values(eid,rid);
 insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role) select rid,u[i+1],i,r,r from unnest(array['임프','탕녀','독살범','수도사','성자','군인','초공감자']) with ordinality x(r,i);
 perform set_config('request.jwt.claim.sub',u[1]::text,true);
 foreach role in array array['세탁부','사서','수사관','요리사','초공감자','점쟁이','장의사','수도사','까마귀지기','성결자','처단자','군인','시장','집사','주정뱅이','은둔자','성자','독살범','첩자','남작','탕녀','임프'] loop
  for state in 0..3 loop for source_state in 0..3 loop
   update public.clocktower_live_members set actual_role=role,shown_role=role,alive=state<>3 where room_id=rid and user_id=u[8];
   update public.clocktower_live_members set alive=source_state<>1,actual_role=case when source_state=2 then '임프' else '독살범' end where room_id=rid and user_id=u[4];
   engine:=jsonb_build_object('poison',jsonb_build_object('source',u[4],'target',u[8],'night',2),'conditions',jsonb_build_object(u[8]::text,jsonb_build_object('drunk',state=1,'poisoned',state=2),u[4]::text,jsonb_build_object('drunk',source_state=3)));
   update public.clocktower_live_rooms set night_engine=engine where id=rid;
   assert public.clocktower_healthy(rid,u[8])=(role<>'주정뱅이' and state=0 and source_state<>0),'SQL health matrix';
  end loop;end loop;
 end loop;
 -- Execution succession uses the live count BEFORE death.
 for n in 4..7 loop foreach bad in array array[false,true] loop
  update public.clocktower_live_members set actual_role=x.r,shown_role=x.r,alive=seat<=n,public_alive=seat<=n from unnest(array['임프','탕녀','독살범','수도사','성자','군인','초공감자']) with ordinality x(r,i) where room_id=rid and seat=x.i;
  update public.clocktower_live_rooms set phase='DAY',winner=null,night_engine=jsonb_build_object('conditions',jsonb_build_object(u[3]::text,jsonb_build_object('poisoned',bad))) where id=rid;
  perform public.clocktower_execute(rid,u[2]);
  assert (select actual_role='임프' from public.clocktower_live_members where room_id=rid and user_id=u[3])=(n>=5 and not bad),'Scarlet execution succession';
  assert (select phase='ENDED' from public.clocktower_live_rooms where id=rid)=(n<5 or bad),'Winner after succession';
 end loop;end loop;
 foreach bad in array array[false,true] loop
  update public.clocktower_live_members set actual_role=x.r,shown_role=x.r,alive=true,public_alive=true from unnest(array['임프','탕녀','독살범','수도사','성자','군인','초공감자']) with ordinality x(r,i) where room_id=rid and seat=x.i;
  update public.clocktower_live_rooms set phase='DAY',winner=null,night_engine=jsonb_build_object('conditions',jsonb_build_object(u[6]::text,jsonb_build_object('drunk',bad))) where id=rid;
  perform public.clocktower_execute(rid,u[6]);assert (select phase='ENDED' from public.clocktower_live_rooms where id=rid)=not bad,'Saint impairment';
 end loop;
 update public.clocktower_live_members set alive=true,public_alive=true where room_id=rid;
 update public.clocktower_live_rooms set phase='NIGHT',night=2,winner=null,night_engine='{}' where id=rid;
 engine:=jsonb_build_object('night',2,'cursor',0,'finished',false,'conditions','{}'::jsonb,'tasks',jsonb_build_array(jsonb_build_object('user_id',u[2],'role','임프','key','audit')));
 perform pg_temp.audit_action('engine_start',jsonb_build_object('state',engine));
 perform pg_temp.audit_action('engine_next',jsonb_build_object('request',jsonb_build_object('user_id',u[2],'target_count',1,'allow_self',true,'prompt','대상 선택')));
 select (night_engine->>'active')::uuid,engine_version into qid,v from public.clocktower_live_rooms where id=rid;
 perform set_config('request.jwt.claim.sub',u[2]::text,true);
 perform pg_temp.audit_action('reply',jsonb_build_object('request_id',qid,'targets',jsonb_build_array(u[8])));
 perform set_config('request.jwt.claim.sub',u[1]::text,true);
 blocked:=false;begin perform pg_temp.audit_action('engine_approve',jsonb_build_object('version',v,'request_id',qid,'result','stale'));exception when others then blocked:=true;end;assert blocked,'Stale approval';
 perform pg_temp.audit_action('engine_approve',jsonb_build_object('request_id',qid,'result','확인했습니다.','changes',jsonb_build_array(jsonb_build_object('user_id',u[8],'actual_role','초공감자','shown_role','초공감자','alive',false))));
 blocked:=false;begin perform pg_temp.audit_action('engine_approve',jsonb_build_object('request_id',qid,'result','duplicate'));exception when others then blocked:=true;end;assert blocked,'Duplicate approval';
 select night_engine||'{"cursor":1,"finished":true}' into engine from public.clocktower_live_rooms where id=rid;
 blocked:=false;begin perform pg_temp.audit_action('engine_next',jsonb_build_object('state',engine));exception when others then blocked:=true;end;assert blocked,'Acknowledgement gate';
 perform set_config('request.jwt.claim.sub',u[8]::text,true);s:=public.clocktower_live_snapshot(eid);
 assert not(s?'engine'),'Private engine';assert not exists(select 1 from jsonb_array_elements(s->'members')m where m?'actual_role' or m?'notes'),'Private roles';
 assert (select (m->>'alive')::boolean from jsonb_array_elements(s->'members')m where m->>'user_id'=u[8]::text),'Death hidden until dawn';
 assert not exists(select 1 from jsonb_array_elements(s->'requests')q where q->>'user_id'<>u[8]::text),'Private requests';
 perform set_config('request.jwt.claim.sub',u[2]::text,true);perform pg_temp.audit_action('ack',jsonb_build_object('request_id',qid));
 perform set_config('request.jwt.claim.sub',u[1]::text,true);perform pg_temp.audit_action('engine_next',jsonb_build_object('state',engine));
 update public.clocktower_live_missions set completed=true where room_id=rid;
 perform pg_temp.audit_action('flow_next');assert (select not public_alive from public.clocktower_live_members where room_id=rid and user_id=u[8]),'Dawn reveals death';
end $$;
select 'PASS: 352 health cases, 8 succession cases, 2 Saint cases, request/approve/ack/dawn/privacy' as audit;
rollback;
