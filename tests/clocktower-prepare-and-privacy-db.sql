-- Owner connection; requires an existing SETUP room with a player. No lasting changes.
begin;
do $$ declare r public.clocktower_live_rooms;admin_id uuid;member_id uuid;last_id uuid;new_id uuid;s jsonb;blocked boolean;
begin
 select * into r from public.clocktower_live_rooms where phase='SETUP' and exists(select 1 from public.clocktower_live_members where room_id=clocktower_live_rooms.id and user_id<>storyteller_id) order by created_at desc limit 1;assert r.id is not null;
 select user_id into admin_id from public.site_roles where role='MAIN_ADMIN' limit 1;assert admin_id is not null;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 select id into last_id from public.clocktower_event_plays where event_id=r.event_id order by play_number desc limit 1;
 new_id:=(public.clocktower_event_plays_command(r.event_id,'add',jsonb_build_object('after_id',last_id))->>'id')::uuid;
 assert new_id<>last_id;
 assert (select room_id is null and result_round_id is null from public.clocktower_event_plays where id=new_id),'preparation only';
 assert (select to_jsonb(x)=to_jsonb(r) from public.clocktower_live_rooms x where id=r.id),'active room unchanged';
 blocked:=false;begin perform public.clocktower_event_plays_command(r.event_id,'open',jsonb_build_object('play_id',new_id));exception when others then blocked:=true;end;assert blocked,'no parallel rooms';
 select user_id into member_id from public.clocktower_live_members where room_id=r.id and user_id<>r.storyteller_id limit 1;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 s:=public.clocktower_live_snapshot(r.event_id);assert s->>'is_host'='false';
 assert not(s?'engine') and not(s?'engine_version'),'private night setup';
 assert not exists(select 1 from jsonb_array_elements(s->'members') m where m?'actual_role' or m?'notes'),'private roles and notes';
 assert not exists(select 1 from jsonb_array_elements(s->'requests') q where q->>'user_id'<>member_id::text),'only own requests';
 if public.current_site_role() is distinct from 'MAIN_ADMIN' then
  blocked:=false;begin perform public.clocktower_event_plays_command(r.event_id,'add',jsonb_build_object('after_id',new_id));exception when others then blocked:=sqlerrm='한판 더는 메인 관리자만 사용할 수 있습니다.';end;assert blocked,'main admin only';
 end if;
 perform set_config('request.jwt.claim.sub',r.storyteller_id::text,true);
 s:=public.clocktower_live_snapshot(r.event_id);assert s->>'is_host'='true' and s?'engine','host retains setup';
end $$;
select 'PASS: prepare during active game, no room changes, no parallel rooms, player secrets hidden' as verification;
rollback;
