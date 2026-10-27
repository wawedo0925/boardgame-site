-- Share the existing result/statistics pipeline without creating attendance or events.
begin;
alter table public.event_game_sessions alter column event_id drop not null;
alter table public.event_game_sessions add column if not exists clocktower_room_id uuid references public.clocktower_live_rooms(id);
alter table public.event_game_sessions add column if not exists world_title text;
create unique index if not exists event_game_sessions_clocktower_room_unique on public.event_game_sessions(clocktower_room_id) where clocktower_room_id is not null;
do $$ begin
if not exists(select 1 from pg_constraint where conrelid='public.event_game_sessions'::regclass and conname='event_game_sessions_source_check') then
alter table public.event_game_sessions add constraint event_game_sessions_source_check check (
 (event_id is not null and clocktower_room_id is null and world_title is null)
 or (event_id is null and clocktower_room_id is not null and world_title is not null and result_type='ROLE')
);
end if; end $$;
create or replace function public.clocktower_save_finished_result(p_room uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; gid uuid; sid uuid; rid uuid; seq integer;
 m record; kind text; faction text;
begin
 select * into r from public.clocktower_live_rooms where id=p_room for update;
 if r.id is null or r.phase<>'ENDED' or r.winner is null or r.winner not in ('GOOD','EVIL') then return null;end if;
 if r.result_round_id is not null then return r.result_round_id;end if;
 -- Serialize round allocation across rooms belonging to the same event.
 perform pg_advisory_xact_lock(hashtextextended(coalesce(r.event_id,r.id)::text,0));
 select id into gid from public.games where name ilike '%시계탑에 흐른 피%' order by name,id limit 1;
 if gid is null then raise exception '시계탑 게임 항목이 없어 결과를 저장하지 못했습니다.';end if;
 if r.event_id is null then
  select id into sid from public.event_game_sessions where clocktower_room_id=r.id;
  if sid is null then
   insert into public.event_game_sessions(event_id,clocktower_room_id,world_title,game_id,result_type,created_by)
    values(null,r.id,r.world_title,gid,'ROLE',r.storyteller_id) returning id into sid;
  end if;
 else
  select id into sid from public.event_game_sessions where event_id=r.event_id and game_id=gid order by created_at,id limit 1;
  if sid is null then
   insert into public.event_game_sessions(event_id,game_id,result_type,created_by) values(r.event_id,gid,'ROLE',r.storyteller_id) returning id into sid;
  end if;
 end if;
 select coalesce(max(round_number),0)+1 into seq from public.event_game_rounds where session_id=sid;
 insert into public.event_game_rounds(session_id,round_number,created_by) values(sid,seq,r.storyteller_id) returning id into rid;
 for m in select * from public.clocktower_live_members where room_id=r.id order by seat loop
  kind:=case when r.script='BMR' then public.clocktower_bmr_role_kind(m.actual_role) else case when m.actual_role='임프' then '악마'
   when m.actual_role=any(array['독살범','첩자','남작','탕녀']) then '하수인'
   when m.actual_role=any(array['집사','주정뱅이','은둔자','성자']) then '외지인'
   when m.actual_role=any(array['세탁부','사서','수사관','요리사','초공감자','점쟁이','장의사','수도사','까마귀지기','성결자','처단자','군인','시장']) then '주민' else null end end;
  if kind is null then raise exception '알 수 없는 캐릭터로 결과를 저장할 수 없습니다: %',m.actual_role;end if;
  faction:=case when r.script='BMR' then case when m.bmr->>'faction'='EVIL' then '악' else '선' end else case when kind in ('악마','하수인') then '악' else '선' end end;
  insert into public.event_round_players(round_id,user_id,role_name,team_name,is_winner,is_gm,updated_at)
   values(rid,m.user_id,m.actual_role,case when r.script='BMR' then '피로 물든 달 · ' else '점철되는 혼란 · ' end||kind||' · '||faction,
    faction=case when r.winner='GOOD' then '선' else '악' end,false,now());
 end loop;
 if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=r.storyteller_id) then
  insert into public.event_round_players(round_id,user_id,role_name,team_name,is_winner,is_gm,updated_at)
   values(rid,r.storyteller_id,null,null,null,true,now());
 end if;
 update public.clocktower_live_rooms set result_round_id=rid,result_saved_at=now() where id=r.id;
 return rid;
end $$;


-- Keep automatic result notifications navigable for standalone games too.
do $$ declare f text; begin
 if to_regprocedure('public.notify_round_result()') is not null then
  f:=pg_get_functiondef('public.notify_round_result()'::regprocedure);
  f:=replace(f, '''/events/'' || v_round.event_id', 'coalesce(''/events/'' || v_round.event_id, ''/mypage'')');
  execute f;
 end if;
end $$;

-- Previously completed standalone games are recorded once; cancelled rooms have no winner.
do $$ declare r record; begin
 for r in select id from public.clocktower_live_rooms where event_id is null and phase='ENDED' and winner in ('GOOD','EVIL') and result_round_id is null loop
  perform public.clocktower_save_finished_result(r.id);
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
