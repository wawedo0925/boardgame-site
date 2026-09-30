begin;

create or replace function public.tichu_randomize_teams(p_room uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  room_row public.tichu_rooms%rowtype;
  player_count int;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into room_row
  from public.tichu_rooms
  where id=p_room
  for update;

  if not found or room_row.host_id<>auth.uid() then
    raise exception '방장만 팀을 무작위로 배정할 수 있습니다.';
  end if;
  if room_row.status<>'WAITING' then
    raise exception '대기방에서만 팀을 배정할 수 있습니다.';
  end if;

  select count(*) into player_count
  from public.tichu_players
  where room_id=p_room;

  if player_count<2 then
    raise exception '두 명 이상일 때 팀을 배정할 수 있습니다.';
  end if;

  with shuffled as (
    select user_id,row_number() over(order by random()) as position
    from public.tichu_players
    where room_id=p_room
  )
  update public.tichu_players p
  set team=case when s.position<=ceil(player_count/2.0) then 0 else 1 end,
      ready=false
  from shuffled s
  where p.room_id=p_room and p.user_id=s.user_id;

  update public.tichu_rooms
  set revision=revision+1,updated_at=now()
  where id=p_room;
end
$$;

revoke all on function public.tichu_randomize_teams(uuid) from public,anon;
grant execute on function public.tichu_randomize_teams(uuid) to authenticated;

commit;
