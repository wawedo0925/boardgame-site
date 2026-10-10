create or replace function public.yut_toggle_rematch(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from yut_rooms where id=p_room and status='FINISHED') then
    raise exception '게임이 끝난 뒤에 다시 하기를 선택할 수 있습니다.';
  end if;

  update yut_players
  set ready=not ready
  where room_id=p_room and user_id=auth.uid() and not is_bot;
  if not found then raise exception '참가자가 아닙니다.'; end if;

  update yut_players set ready=true where room_id=p_room and is_bot;
  update yut_rooms set revision=revision+1,updated_at=now() where id=p_room;
end $$;

create or replace function public.yut_start_rematch(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; teams int;
begin
  select * into r from yut_rooms where id=p_room for update;
  if not found or r.host_id<>auth.uid() or r.status<>'FINISHED' then
    raise exception '종료된 방의 방장만 새 게임을 시작할 수 있습니다.';
  end if;
  if exists(select 1 from yut_players where room_id=p_room and not ready) then
    raise exception '모든 참가자가 다시 하기를 눌러야 합니다.';
  end if;

  update yut_players set seat=seat+100 where room_id=p_room;
  with shuffled as (
    select id,(row_number() over(order by random())-1)::int as new_seat
    from yut_players where room_id=p_room
  )
  update yut_players p set seat=s.new_seat from shuffled s where p.id=s.id;

  teams:=case when r.mode='INDIVIDUAL' then r.max_players when r.mode='TEAM_2V2' then 2 else 3 end;
  delete from yut_pieces where room_id=p_room;
  insert into yut_pieces(room_id,team,piece_no)
  select p_room,t,p from generate_series(0,teams-1)t cross join generate_series(0,3)p;
  update yut_players set ready=is_bot where room_id=p_room;
  update yut_rooms
  set status='PLAYING',turn_seat=0,pending_moves='{}',can_roll=true,last_roll=null,
      winner_team=null,finish_order='{}',revision=revision+1,updated_at=now()
  where id=p_room;
end $$;

create or replace function public.yut_start_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; teams int;
begin
  select * into r from yut_rooms where id=p_room for update;
  if r.host_id<>auth.uid() or r.status<>'WAITING' then raise exception '방장만 시작할 수 있습니다.'; end if;
  if (select count(*) from yut_players where room_id=p_room)<>r.max_players then raise exception '모든 자리를 채워 주세요.'; end if;
  if exists(select 1 from yut_players where room_id=p_room and not ready and user_id<>r.host_id) then raise exception '모두 준비해야 합니다.'; end if;
  update yut_players set seat=seat+100 where room_id=p_room;
  with shuffled as (
    select id,(row_number() over(order by random())-1)::int as new_seat
    from yut_players where room_id=p_room
  )
  update yut_players p set seat=s.new_seat from shuffled s where p.id=s.id;
  teams:=case when r.mode='INDIVIDUAL' then r.max_players when r.mode='TEAM_2V2' then 2 else 3 end;
  delete from yut_pieces where room_id=p_room;
  insert into yut_pieces(room_id,team,piece_no) select p_room,t,p from generate_series(0,teams-1)t cross join generate_series(0,3)p;
  update yut_players set ready=is_bot where room_id=p_room;
  update yut_rooms
  set status='PLAYING',turn_seat=0,pending_moves='{}',can_roll=true,last_roll=null,
      winner_team=null,finish_order='{}',revision=revision+1,updated_at=now()
  where id=p_room;
end $$;

revoke all on function public.yut_toggle_rematch(uuid),public.yut_start_rematch(uuid) from public,anon;
grant execute on function public.yut_toggle_rematch(uuid),public.yut_start_rematch(uuid) to authenticated;
