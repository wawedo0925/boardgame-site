-- Run after migration as database owner. All fixture changes roll back.
begin;
do $$
declare eid uuid; host uuid; member uuid; candidate uuid; p1 uuid;p2 uuid;p3 uuid;
 room1 uuid;room2 uuid;result1 uuid;result2 uuid;s jsonb;payload jsonb;blocked boolean;before_count bigint;
begin
 select e.id into eid from public.events e where e.event_kind<>'CLOCKTOWER'
 and exists(select 1 from public.event_participants where event_id=e.id)
 and not exists(select 1 from public.clocktower_live_rooms where event_id=e.id) limit 1;
 assert eid is not null,'fixture event';
 update public.events set event_kind='CLOCKTOWER',event_status='OPEN' where id=eid;
 for candidate in select id from auth.users loop
  perform set_config('request.jwt.claim.sub',candidate::text,true);
  if public.current_site_role()='MAIN_ADMIN' and public.can_operate_event(eid) then host:=candidate;exit;end if;
 end loop;
 assert host is not null,'operator';
 select user_id into member from public.event_participants where event_id=eid limit 1;
 select count(*) into before_count from public.event_game_rounds r join public.event_game_sessions s on s.id=r.session_id where s.event_id=eid;
 s:=public.clocktower_event_plays_command(eid,'add','{}');p1:=(s->>'id')::uuid;
 assert public.clocktower_event_plays_command(eid,'add','{}')->>'id'=p1::text,'retry same first card';
 assert (select count(*)=before_count from public.event_game_rounds r join public.event_game_sessions s on s.id=r.session_id where s.event_id=eid),'preparation creates no history';
 blocked:=false;begin perform public.clocktower_event_plays_command(eid,'add',jsonb_build_object('after_id',p1));exception when others then blocked:=true;end;assert blocked,'unfinished card cannot add next';
 payload:=jsonb_build_object('play_id',p1,'difficulty','점철되는 혼란','winning_faction','선','assignments',jsonb_build_array(jsonb_build_object('user_id',member,'character_name','군인','character_type','주민','faction','선')));
 result1:=(public.clocktower_event_plays_command(eid,'save',payload)->>'result_round_id')::uuid;
 assert (public.clocktower_event_plays_command(eid,'save',payload)->>'result_round_id')::uuid=result1,'manual retry';
 p2:=(public.clocktower_event_plays_command(eid,'add',jsonb_build_object('after_id',p1))->>'id')::uuid;
 assert (public.clocktower_event_plays_command(eid,'add',jsonb_build_object('after_id',p1))->>'id')::uuid=p2,'next retry';
 room1:=(public.clocktower_event_plays_command(eid,'open',jsonb_build_object('play_id',p2))->>'room_id')::uuid;
 assert (public.clocktower_event_plays_command(eid,'open',jsonb_build_object('play_id',p2))->>'room_id')::uuid=room1,'open retry';
 delete from public.clocktower_live_members where room_id=room1;
 insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role) values(room1,member,1,'군인','군인');
 s:=public.clocktower_event_plays_command(eid,'list');assert s->1->'players'='[]'::jsonb,'no live roles in card';
 blocked:=false;begin perform public.clocktower_event_plays_command(eid,'save',payload||jsonb_build_object('play_id',p2));exception when others then blocked:=true;end;assert blocked,'cannot overwrite active game';
 perform public.clocktower_end_game(room1,'GOOD','test');
 select result_round_id into result2 from public.clocktower_event_plays where id=p2;
 assert result2 is not null and result2<>result1,'automatic result linked to correct card';
 assert (select is_winner from public.event_round_players where round_id=result1 and user_id=member),'prior result retained';
 p3:=(public.clocktower_event_plays_command(eid,'add',jsonb_build_object('after_id',p2))->>'id')::uuid;
 room2:=(public.clocktower_event_plays_command(eid,'open',jsonb_build_object('play_id',p3))->>'room_id')::uuid;
 assert room1<>room2,'fresh room';
 assert (select phase='SETUP' and night=0 and winner is null and result_round_id is null from public.clocktower_live_rooms where id=room2),'new state';
 blocked:=false;begin perform public.clocktower_event_plays_command(eid,'open',jsonb_build_object('play_id',p2));exception when others then blocked:=true;end;assert blocked,'old card cannot enter new room';
 update public.clocktower_live_rooms set phase='ENDED' where id=room2;
 assert (select result_round_id is null from public.clocktower_event_plays where id=p3),'end without winner no history';
 for candidate in select id from auth.users where id<>host loop
  perform set_config('request.jwt.claim.sub',candidate::text,true);
  if not coalesce(public.can_operate_event(eid),false) then exit;end if;
 end loop;
 blocked:=false;begin perform public.clocktower_event_plays_command(eid,'add',jsonb_build_object('after_id',p3));exception when others then blocked:=true;end;assert blocked,'nonoperator cannot add';
 assert not has_table_privilege('authenticated','public.clocktower_event_plays','SELECT'),'private table';
end $$;
select 'PASS: preparation, retries, manual/automatic history, fresh rooms, old links, hidden roles, authorization, no-winner end' as audit;
rollback;
