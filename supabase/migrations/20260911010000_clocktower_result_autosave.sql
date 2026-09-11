begin;
alter table public.clocktower_live_rooms
 add column result_round_id uuid unique references public.event_game_rounds(id) on delete set null,
 add column result_saved_at timestamptz;

create function public.clocktower_save_finished_result(p_room uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; gid uuid; sid uuid; rid uuid; seq integer;
 m record; kind text; faction text;
begin
 select * into r from public.clocktower_live_rooms where id=p_room for update;
 if r.id is null or r.phase<>'ENDED' or r.winner is null or r.winner not in ('GOOD','EVIL') then return null;end if;
 if r.result_round_id is not null then return r.result_round_id;end if;
 -- Serialize round allocation across rooms belonging to the same event.
 perform pg_advisory_xact_lock(hashtextextended(r.event_id::text,0));
 select id into gid from public.games where name ilike '%시계탑에 흐른 피%' order by name,id limit 1;
 if gid is null then raise exception '시계탑 게임 항목이 없어 결과를 저장하지 못했습니다.';end if;
 select id into sid from public.event_game_sessions where event_id=r.event_id and game_id=gid order by created_at,id limit 1;
 if sid is null then
  insert into public.event_game_sessions(event_id,game_id,result_type,created_by) values(r.event_id,gid,'ROLE',r.storyteller_id) returning id into sid;
 end if;
 select coalesce(max(round_number),0)+1 into seq from public.event_game_rounds where session_id=sid;
 insert into public.event_game_rounds(session_id,round_number,created_by) values(sid,seq,r.storyteller_id) returning id into rid;
 for m in select * from public.clocktower_live_members where room_id=r.id order by seat loop
  kind:=case when m.actual_role='임프' then '악마'
   when m.actual_role=any(array['독살범','첩자','남작','탕녀']) then '하수인'
   when m.actual_role=any(array['집사','주정뱅이','은둔자','성자']) then '외지인'
   when m.actual_role=any(array['세탁부','사서','수사관','요리사','초공감자','점쟁이','장의사','수도사','까마귀지기','성결자','처단자','군인','시장']) then '주민' else null end;
  if kind is null then raise exception '알 수 없는 캐릭터로 결과를 저장할 수 없습니다: %',m.actual_role;end if;
  faction:=case when kind in ('악마','하수인') then '악' else '선' end;
  insert into public.event_round_players(round_id,user_id,role_name,team_name,is_winner,is_gm,updated_at)
   values(rid,m.user_id,m.actual_role,'점철되는 혼란 · '||kind||' · '||faction,
    faction=case when r.winner='GOOD' then '선' else '악' end,false,now());
 end loop;
 if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=r.storyteller_id) then
  insert into public.event_round_players(round_id,user_id,role_name,team_name,is_winner,is_gm,updated_at)
   values(rid,r.storyteller_id,null,null,null,true,now());
 end if;
 update public.clocktower_live_rooms set result_round_id=rid,result_saved_at=now() where id=r.id;
 return rid;
end $$;
revoke all on function public.clocktower_save_finished_result(uuid) from public,anon,authenticated;

create function public.clocktower_autosave_result_trigger() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.phase='ENDED' and new.winner in ('GOOD','EVIL') and new.result_round_id is null then
  perform public.clocktower_save_finished_result(new.id);
 end if;
 return new;
end $$;
revoke all on function public.clocktower_autosave_result_trigger() from public,anon,authenticated;
create trigger clocktower_autosave_result after update of phase,winner on public.clocktower_live_rooms
 for each row execute function public.clocktower_autosave_result_trigger();

alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_before_result_autosave;
revoke all on function public.clocktower_live_snapshot_before_result_autosave(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s jsonb;r public.clocktower_live_rooms;
begin
 s:=public.clocktower_live_snapshot_before_result_autosave(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select * into r from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
 return jsonb_set(s,'{room}',s->'room'||jsonb_build_object('result_round_id',r.result_round_id,'result_saved_at',r.result_saved_at));
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;
commit;
