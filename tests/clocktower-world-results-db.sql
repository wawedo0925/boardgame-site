-- Owner-only production integration check: all fixtures and notifications roll back.
begin;
do $$ declare u uuid[]; room uuid; rid uuid; gid uuid; before_wins bigint; after_wins bigint; begin
 select array_agg(id) into u from(select id from auth.users order by id limit 6)x;
 assert cardinality(u)=6;
 select id into gid from public.games where name ilike '%시계탑에 흐른 피%' order by name,id limit 1;
 assert (select type='ROLE' from public.games where id=gid);
 select coalesce(max(role_wins),0) into before_wins from public.get_game_rankings(gid) where member_id=u[2];
 insert into public.clocktower_live_rooms(storyteller_id,world_title,phase) values(u[1],'결과 연결 검증','NIGHT') returning id into room;
 insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role)
 select room,u[i+1],i,role,role from unnest(array['군인','요리사','처단자','독살범','임프']) with ordinality x(role,i);
 perform public.clocktower_end_game(room,'GOOD','transactional verification');
 select result_round_id into rid from public.clocktower_live_rooms where id=room;
 assert rid is not null;
 assert (select count(*)=6 from public.event_round_players where round_id=rid);
 assert (select count(*)=3 from public.event_round_players where round_id=rid and is_winner);
 assert (select is_gm and is_winner is null from public.event_round_players where round_id=rid and user_id=u[1]);
 select role_wins into after_wins from public.get_game_rankings(gid) where member_id=u[2];
 assert after_wins=before_wins+1,'world result must enter rankings';
 assert exists(select 1 from public.get_member_achievements(u[2],false) where badge_code='ROLE_WIN' and earned),'world result must enter achievements';
 perform set_config('request.jwt.claim.sub',u[2]::text,true);
 assert exists(select 1 from public.get_my_ranked_games() where game_id=gid),'world result must enter personal rankings';
 assert exists(select 1 from public.notifications where recipient_id=u[2] and dedupe_key='result:'||rid||':'||u[2] and link='/mypage'),'notification must have a working destination';
 perform public.clocktower_save_finished_result(room);
 assert (select count(*)=1 from public.event_game_sessions where clocktower_room_id=room),'no duplicate session';
 assert (select result_round_id=rid from public.clocktower_live_rooms where id=room),'no duplicate round';
end $$;
select 'PASS: world result, rankings, achievements, GM, notification, idempotency (rolled back)' as audit;
rollback;
