-- Run after clocktower-flow-db.sql fixture body, in the same rollback transaction.
do $$
declare rid uuid;eid uuid;u uuid[];host uuid;vid uuid;sid uuid;failed boolean;
begin
 select c.rid,c.eid into rid,eid from flow_context c;
 select storyteller_id into host from public.clocktower_live_rooms where id=rid;
 select array_agg(user_id order by seat) into u from public.clocktower_live_members where room_id=rid;
 perform set_config('request.jwt.claim.sub',host::text,true);
 delete from public.clocktower_live_votes where room_id=rid;
 update public.clocktower_live_rooms set phase='DAY',night=3,day_stage='NOMINATIONS',winner=null,night_engine='{}' where id=rid;
 update public.clocktower_live_members set alive=true,public_alive=true,ghost_vote_used=false,actual_role=case seat when 1 then '처단자' when 2 then '집사' when 4 then '탕녀' when 5 then '임프' else '군인' end where room_id=rid;
 update public.clocktower_live_members set alive=false,public_alive=false where room_id=rid and user_id=u[3];
 perform pg_temp.flow_action('vote_nominate',jsonb_build_object('nominator',u[1],'nominee',u[4]));
 select id into vid from public.clocktower_live_votes where room_id=rid and status='WAITING';
 perform pg_temp.flow_action('vote_start',jsonb_build_object('vote_id',vid));
 assert (select started_at is null from public.clocktower_live_votes where id=vid),'manual vote has no deadline';
 perform public.clocktower_finish_votes(rid);
 assert (select status='RUNNING' from public.clocktower_live_votes where id=vid),'manual vote remains running';
 perform pg_temp.flow_action('vote_record',jsonb_build_object('vote_id',vid,'user_id',u[3],'yes',true));
 assert not (select ghost_vote_used from public.clocktower_live_members where room_id=rid and user_id=u[3]),'draft does not spend ghost';
 perform pg_temp.flow_action('vote_record',jsonb_build_object('vote_id',vid,'user_id',u[3],'yes',false));
 perform pg_temp.flow_action('vote_record',jsonb_build_object('vote_id',vid,'user_id',u[2],'yes',true));
 failed:=false;begin perform pg_temp.flow_action('vote_finish',jsonb_build_object('vote_id',vid));exception when others then failed:=true;end;assert failed,'butler requires host confirmation';
 perform set_config('request.jwt.claim.sub',u[1]::text,true);
 failed:=false;begin perform pg_temp.flow_action('vote_record',jsonb_build_object('vote_id',vid,'user_id',u[3],'yes',true));exception when others then failed:=true;end;assert failed,'participant cannot count votes';
 perform set_config('request.jwt.claim.sub',host::text,true);
 perform pg_temp.flow_action('vote_record',jsonb_build_object('vote_id',vid,'user_id',u[3],'yes',true));
 perform pg_temp.flow_action('vote_finish',jsonb_build_object('vote_id',vid,'butler_checked',true));
 assert (select ghost_vote_used from public.clocktower_live_members where room_id=rid and user_id=u[3]),'final spends ghost';
 assert (select status='DONE' from public.clocktower_live_votes where id=vid),'final closes vote';
 -- Anyone may bluff. An impaired Slayer spends their attempt without killing.
 perform pg_temp.flow_action('slayer_declare',jsonb_build_object('actor',u[2],'target',u[5]));
 select id into sid from public.clocktower_shots where room_id=rid and status='PENDING';
 perform pg_temp.flow_action('slayer_resolve',jsonb_build_object('shot_id',sid));
 assert (select alive from public.clocktower_live_members where room_id=rid and user_id=u[5]),'bluff no kill';
 update public.clocktower_live_rooms set night_engine=jsonb_build_object('conditions',jsonb_build_object(u[1]::text,jsonb_build_object('poisoned',true))) where id=rid;
 perform pg_temp.flow_action('slayer_declare',jsonb_build_object('actor',u[1],'target',u[5]));
 select id into sid from public.clocktower_shots where room_id=rid and status='PENDING';
 perform pg_temp.flow_action('slayer_resolve',jsonb_build_object('shot_id',sid));
 assert (select alive from public.clocktower_live_members where room_id=rid and user_id=u[5]),'poisoned slayer no kill';
 failed:=false;begin perform pg_temp.flow_action('slayer_declare',jsonb_build_object('actor',u[1],'target',u[5]));exception when others then failed:=true;end;assert failed,'spent attempt cannot repeat';
 delete from public.clocktower_shots where room_id=rid;
 update public.clocktower_live_rooms set night_engine='{}' where id=rid;
 update public.clocktower_live_members set alive=true,public_alive=true where room_id=rid;
 perform pg_temp.flow_action('slayer_declare',jsonb_build_object('actor',u[1],'target',u[5]));
 select id into sid from public.clocktower_shots where room_id=rid and status='PENDING';
 perform pg_temp.flow_action('slayer_resolve',jsonb_build_object('shot_id',sid));
 assert not (select alive from public.clocktower_live_members where room_id=rid and user_id=u[5]),'real slayer kills demon';
 assert (select actual_role='임프' from public.clocktower_live_members where room_id=rid and user_id=u[4]),'scarlet inherits';
 assert (select phase='DAY' and not night_engine?'execution' from public.clocktower_live_rooms where id=rid),'slayer is not execution and does not end day';
 delete from public.clocktower_live_votes where room_id=rid;
 update public.clocktower_live_rooms set night_engine=jsonb_build_object('conditions',jsonb_build_object(u[1]::text,jsonb_build_object('drunk',true,'drunk_until',4,'poisoned',true,'poisoned_until',0))) where id=rid;
 perform pg_temp.flow_action('flow_next');
 assert (select night=4 and phase='NIGHT' and night_engine->'conditions'->u[1]::text->>'drunk'='false' and night_engine->'conditions'->u[1]::text->>'poisoned'='true' from public.clocktower_live_rooms where id=rid),'only selected expiry cleared';
 assert (select count(*)=5 from public.clocktower_live_missions where room_id=rid and night=4 and round=1),'first missions for everyone';
 assert not exists(select 1 from public.clocktower_live_missions x join public.clocktower_live_rooms r on r.id=x.room_id where x.room_id=rid and x.night=4 and (available_at<night_started_at+interval '3 seconds' or available_at>night_started_at+interval '5 seconds')),'first delay 3-5 seconds';
 perform set_config('request.jwt.claim.sub',u[1]::text,true);
 assert jsonb_array_length(public.clocktower_live_snapshot(eid)->'missions')=0,'future missions hidden';
end $$;
do $$
declare rid uuid;u uuid[];i integer;
begin
 select c.rid into rid from flow_context c;
 select array_agg(user_id order by seat) into u from public.clocktower_live_members where room_id=rid;
 update public.clocktower_live_missions set completed=true where room_id=rid and night=4 and user_id<>u[2];
 perform setseed(0.4);
 for i in 1..20 loop
  insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,status,acknowledged) values(rid,u[1],4,'cover test',0,'RESOLVED',true);
 end loop;
 assert not exists(select 1 from public.clocktower_live_missions where room_id=rid and night=4 and user_id in (u[1],u[2]) and round>1),'active actor and pending mission excluded';
 assert exists(select 1 from public.clocktower_live_missions where room_id=rid and night=4 and round>1),'idle members receive random cover';
 assert not exists(select user_id from public.clocktower_live_missions where room_id=rid and night=4 and not completed group by user_id having count(*)>1),'no mission backlog';
end $$;
