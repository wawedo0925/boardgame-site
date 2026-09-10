-- Execute after the migration, inside a transaction. No fixture data is retained.
begin;
create temporary table flow_context(eid uuid,rid uuid);
create function pg_temp.flow_action(action text,extra jsonb default '{}') returns void language plpgsql as $$
declare c record;r public.clocktower_live_rooms;
begin
 select * into c from flow_context;select * into r from public.clocktower_live_rooms where id=c.rid;
 perform public.clocktower_live_command(c.eid,action,jsonb_build_object('room_id',r.id,'revision',r.flow_revision)||extra);
end $$;
do $$
declare u uuid[];eid uuid;rid uuid;s jsonb;info jsonb;signature text;denied boolean;i integer;scenario integer;
begin
 select array_agg(id) into u from (select id from auth.users order by id limit 6)x;
 select e.id into eid from public.events e where not exists(select 1 from public.clocktower_live_rooms r where r.event_id=e.id and r.phase<>'ENDED') limit 1;
 assert eid is not null and cardinality(u)=6;
 insert into public.clocktower_live_rooms(event_id,storyteller_id) values(eid,u[1]) returning id into rid;
 insert into flow_context values(eid,rid);
 insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role)
 select rid,u[x.i+1],x.i,role,role from unnest(array['성결자','점쟁이','초공감자','독살범','임프']) with ordinality x(role,i);
 select string_agg(user_id::text||':'||actual_role||':'||shown_role,'|' order by user_id::text collate "C") into signature from public.clocktower_live_members where room_id=rid;
 info:=jsonb_build_object('roster',signature,'bluffs',jsonb_build_array('사서','요리사','군인'),'registrations','{}'::jsonb,'clues','{}'::jsonb);
 update public.clocktower_live_rooms set night_engine=jsonb_build_object('information',info,'red_herring',u[3]) where id=rid;
 perform set_config('request.jwt.claim.sub',u[3]::text,true);
 denied:=false;begin perform pg_temp.flow_action('flow_next');exception when others then denied:=true;end;assert denied,'only host advances';
 perform set_config('request.jwt.claim.sub',u[1]::text,true);perform pg_temp.flow_action('flow_next');
 assert (select roles_released and phase='SETUP' from public.clocktower_live_rooms where id=rid),'release before first night';
 denied:=false;begin perform pg_temp.flow_action('flow_next');exception when others then denied:=true;end;assert denied,'all confirmations required';
 perform set_config('request.jwt.claim.sub',u[3]::text,true);s:=public.clocktower_live_snapshot(eid);
 assert not(s?'engine'),'engine hidden';
 assert (select count(*)=1 from jsonb_array_elements(s->'members') m where m?'shown_role'),'only own role released';
 assert not exists(select 1 from jsonb_array_elements(s->'members') m where m?'actual_role' or m?'notes'),'other secrets hidden';
 for i in 2..6 loop perform set_config('request.jwt.claim.sub',u[i]::text,true);perform pg_temp.flow_action('role_ack');end loop;
 perform set_config('request.jwt.claim.sub',u[1]::text,true);perform pg_temp.flow_action('flow_next');
 assert (select phase='NIGHT' and night=1 from public.clocktower_live_rooms where id=rid),'first night';
 denied:=false;begin perform pg_temp.flow_action('flow_next','{"revision":0}');exception when others then denied:=true;end;assert denied,'stale transition rejected';
 denied:=false;begin perform pg_temp.flow_action('flow_next');exception when others then denied:=true;end;assert denied,'unfinished night blocked';
 update public.clocktower_live_rooms set night_engine=night_engine||'{"night":1,"finished":true}' where id=rid;
 perform public.clocktower_make_missions((select r from public.clocktower_live_rooms r where id=rid),1);
 denied:=false;begin perform pg_temp.flow_action('flow_next');exception when others then denied:=true;end;assert denied,'unfinished missions blocked';
 update public.clocktower_live_missions set completed=true where room_id=rid;
 perform pg_temp.flow_action('flow_next');assert (select phase='DAY' and day_stage='PRIVATE' from public.clocktower_live_rooms where id=rid),'private conversation';
 denied:=false;begin perform pg_temp.flow_action('vote_nominate',jsonb_build_object('nominator',u[3],'nominee',u[2]));exception when others then denied:=true;end;assert denied,'no nomination in private conversation';
 perform pg_temp.flow_action('flow_next');assert (select day_stage='NOMINATIONS' from public.clocktower_live_rooms where id=rid),'public discussion';
 -- The nominating Townsfolk can be poisoned; the Virgin owns the ability.
 update public.clocktower_live_rooms set night_engine=night_engine||jsonb_build_object('conditions',jsonb_build_object(u[3]::text,jsonb_build_object('poisoned',true))) where id=rid;
 perform pg_temp.flow_action('vote_nominate',jsonb_build_object('nominator',u[3],'nominee',u[2]));
 assert (select not alive from public.clocktower_live_members where room_id=rid and user_id=u[3]),'poisoned Townsfolk executed';
 assert (select phase='NIGHT' and night=2 and night_engine->'execution'->>'user_id'=u[3]::text from public.clocktower_live_rooms where id=rid),'Virgin ends day and records execution';
 -- Drunk nominator, poisoned Virgin, drunk Virgin, previously used Virgin: no execution.
 for scenario in 1..4 loop
  delete from public.clocktower_live_votes where room_id=rid;
  update public.clocktower_live_members set alive=true,public_alive=true,actual_role=case seat when 1 then '성결자' when 2 then '점쟁이' when 3 then '초공감자' when 4 then '독살범' else '임프' end where room_id=rid;
  update public.clocktower_live_rooms set phase='DAY',night=3,day_stage='NOMINATIONS',night_engine='{}',virgin_used=case when scenario=4 then jsonb_build_object(u[2]::text,true) else '{}'::jsonb end where id=rid;
  if scenario=1 then update public.clocktower_live_members set actual_role='주정뱅이',shown_role='점쟁이' where room_id=rid and user_id=u[3];end if;
  if scenario in (2,3) then update public.clocktower_live_rooms set night_engine=jsonb_build_object('conditions',jsonb_build_object(u[2]::text,jsonb_build_object(case when scenario=2 then 'poisoned' else 'drunk' end,true))) where id=rid;end if;
  perform pg_temp.flow_action('vote_nominate',jsonb_build_object('nominator',u[3],'nominee',u[2]));
  assert (select alive from public.clocktower_live_members where room_id=rid and user_id=u[3]),'invalid Virgin trigger';
  assert (select virgin_used?u[2]::text from public.clocktower_live_rooms where id=rid),'first nomination spent';
  denied:=false;begin perform pg_temp.flow_action('flow_next');exception when others then denied:=true;end;assert denied,'defence blocks next phase';
 end loop;
 -- Tie and no nomination mean no execution. A higher vote executes once.
 for scenario in 0..2 loop
  delete from public.clocktower_live_votes where room_id=rid;
  update public.clocktower_live_members set alive=true,public_alive=true,actual_role=case seat when 1 then '성결자' when 2 then '점쟁이' when 3 then '초공감자' when 4 then '독살범' else '임프' end where room_id=rid;
  update public.clocktower_live_rooms set phase='DAY',night=4,day_stage='NOMINATIONS',night_engine='{}' where id=rid;
  if scenario>0 then
   insert into public.clocktower_live_votes(room_id,day,nominator,nominee,status,threshold,ballots) values(rid,4,u[2],u[3],'DONE',3,jsonb_build_object(u[2]::text,true,u[3]::text,true,u[4]::text,true)),(rid,4,u[3],u[4],'DONE',3,jsonb_build_object(u[2]::text,true,u[3]::text,true,u[4]::text,true));
   if scenario=2 then update public.clocktower_live_votes set ballots=ballots||jsonb_build_object(u[5]::text,true) where room_id=rid and nominee=u[4];end if;
  end if;
  perform pg_temp.flow_action('flow_next');assert (select phase='NIGHT' and night=5 from public.clocktower_live_rooms where id=rid),'next night';
  assert (select count(*) from public.clocktower_live_members where room_id=rid and not alive)=case when scenario=2 then 1 else 0 end,'tie/no nomination/higher score';
 end loop;
 -- Scarlet succession happens before victory; then demon death with fewer than five wins.
 update public.clocktower_live_members set alive=true,actual_role=case seat when 4 then '탕녀' when 5 then '임프' else '군인' end where room_id=rid;
 update public.clocktower_live_rooms set phase='DAY',night_engine='{}',winner=null where id=rid;
 perform public.clocktower_execute(rid,u[6]);
 assert (select actual_role='임프' and alive from public.clocktower_live_members where room_id=rid and user_id=u[5]),'Scarlet inherits';
 assert (select phase='DAY' and winner is null from public.clocktower_live_rooms where id=rid),'do not end before succession';
 perform public.clocktower_execute(rid,u[5]);assert (select winner='GOOD' from public.clocktower_live_rooms where id=rid),'last demon dead';
 -- Healthy Saint loses, poisoned Saint does not.
 for scenario in 1..2 loop
  update public.clocktower_live_members set alive=true,actual_role=case seat when 1 then '성자' when 5 then '임프' else '군인' end where room_id=rid;
  update public.clocktower_live_rooms set phase='DAY',winner=null,night_engine=case when scenario=2 then jsonb_build_object('conditions',jsonb_build_object(u[2]::text,jsonb_build_object('poisoned',true))) else '{}'::jsonb end where id=rid;
  perform public.clocktower_execute(rid,u[2]);assert (select coalesce(winner='EVIL',false) from public.clocktower_live_rooms where id=rid)=(scenario=1),'Saint status';
 end loop;
 delete from public.clocktower_live_votes where room_id=rid;
 update public.clocktower_live_members set alive=seat in (1,2,5),actual_role=case seat when 1 then '시장' when 5 then '임프' else '군인' end where room_id=rid;
 update public.clocktower_live_rooms set phase='DAY',winner=null,day_stage='NOMINATIONS',night_engine='{}' where id=rid;
 perform pg_temp.flow_action('flow_next');assert (select winner='GOOD' from public.clocktower_live_rooms where id=rid),'Mayor no execution';
 update public.clocktower_live_members set alive=seat in (2,5) where room_id=rid;
 update public.clocktower_live_rooms set phase='NIGHT',winner=null where id=rid;
 perform public.clocktower_check_winner(rid);assert (select winner='EVIL' from public.clocktower_live_rooms where id=rid),'two living';
 assert not has_function_privilege('authenticated','public.clocktower_execute(uuid,uuid)','EXECUTE'),'internal execution inaccessible';
 assert not has_function_privilege('authenticated','public.clocktower_live_command_v6(uuid,text,jsonb)','EXECUTE'),'old bypass inaccessible';
end $$;
rollback;
