-- Run with an owner connection after the autosave migration. Fixtures roll back.
begin;
do $$
declare u uuid[];eid uuid;room1 uuid;room2 uuid;rid uuid;rid2 uuid;blocked boolean:=false;s jsonb;
begin
select array_agg(id) into u from(select id from auth.users order by id limit 8)x;assert cardinality(u)=8;
select id into eid from public.events e where not exists(select 1 from public.clocktower_live_rooms r where r.event_id=e.id and phase<>'ENDED') limit 1;assert eid is not null;
insert into public.clocktower_live_rooms(event_id,storyteller_id,phase,night) values(eid,u[1],'NIGHT',2) returning id into room1;
insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role,alive) select room1,u[i+1],i,role,case when role='주정뱅이' then '시장' else role end,i<>1 from unnest(array['임프','임프','주정뱅이','성자','군인','독살범','사서']) with ordinality x(role,i);
perform public.clocktower_end_game(room1,'EVIL','test');select result_round_id into rid from public.clocktower_live_rooms where id=room1;assert rid is not null;
assert (select count(*)=8 from public.event_round_players where round_id=rid),'all players and storyteller';
assert (select count(*)=2 from public.event_round_players where round_id=rid and role_name='임프' and is_winner),'dead and successor Imps win';
assert (select role_name='주정뱅이' and not is_winner from public.event_round_players where round_id=rid and user_id=u[4]),'actual role';
assert (select is_gm and is_winner is null from public.event_round_players where round_id=rid and user_id=u[1]),'storyteller neutral';
perform public.clocktower_end_game(room1,'EVIL','repeat');assert (select result_round_id=rid from public.clocktower_live_rooms where id=room1),'idempotent';
perform set_config('request.jwt.claim.sub',u[1]::text,true);s:=public.clocktower_live_snapshot(eid);assert s->'room'->>'result_round_id'=rid::text,'snapshot';
assert not has_function_privilege('authenticated','public.clocktower_save_finished_result(uuid)','execute'),'private save';
insert into public.clocktower_live_rooms(event_id,storyteller_id,phase,night,created_at) values(eid,u[1],'NIGHT',3,now()+interval '1 second') returning id into room2;
insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role,alive) select room2,user_id,seat,actual_role,shown_role,alive from public.clocktower_live_members where room_id=room1;
perform public.clocktower_end_game(room2,'GOOD','test');select result_round_id into rid2 from public.clocktower_live_rooms where id=room2;assert rid2<>rid,'distinct rounds';
assert (select count(*)=4 from public.event_round_players where round_id=rid2 and is_winner),'good wins';
assert (select count(*)=3 from public.event_round_players where round_id=rid and is_winner),'old result intact';
insert into public.clocktower_live_rooms(event_id,storyteller_id,phase,night) values(eid,u[1],'NIGHT',1) returning id into room2;
insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role) values(room2,u[2],1,'unknown','unknown');
begin perform public.clocktower_end_game(room2,'GOOD','bad');exception when others then blocked:=true;end;
assert blocked and (select phase='NIGHT' and result_round_id is null from public.clocktower_live_rooms where id=room2),'atomic failure';
update public.clocktower_live_rooms set phase='ENDED' where id=room2;assert (select result_round_id is null from public.clocktower_live_rooms where id=room2),'no winner no result';
end $$;
select 'PASS: autosave, dead winners, actual roles, succession, storyteller, idempotency, multiple rounds, snapshot, permissions, atomic failure, manual end' as audit;
rollback;
