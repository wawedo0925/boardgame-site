begin;

create or replace function public.tichu_start_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; player_row record; deck int[];
begin
  select * into r from tichu_rooms where id=p_room for update;
  if r.host_id<>auth.uid() or r.status not in('WAITING','ROUND_END') then raise exception '방장만 시작할 수 있습니다.'; end if;
  if (select count(*) from tichu_players where room_id=p_room)<>4 then raise exception '4명이 있어야 시작할 수 있습니다.'; end if;
  if r.status='WAITING' and (select count(*) from tichu_players where room_id=p_room and ready)<>4 then raise exception '첫 게임은 4명 모두 준비해야 합니다.'; end if;
  if (select count(*) from tichu_players where room_id=p_room and team=0)<>2 or (select count(*) from tichu_players where room_id=p_room and team=1)<>2 then raise exception '각 팀에 2명씩 있어야 합니다.'; end if;

  with ordered as (
    select user_id,team,row_number() over(partition by team order by joined_at)-1 as n
    from tichu_players where room_id=p_room
  )
  update tichu_players tp
  set seat=case when o.team=0 then o.n*2 else o.n*2+1 end
  from ordered o where tp.room_id=p_room and tp.user_id=o.user_id;

  delete from tichu_hands where room_id=p_room;
  delete from tichu_exchanges where room_id=p_room;
  delete from tichu_finished where room_id=p_room;
  delete from tichu_received_cards where room_id=p_room;
  select array_agg(x order by random()) into deck from generate_series(0,55)x;
  for player_row in select * from tichu_players where room_id=p_room loop
    insert into tichu_hands values(
      p_room,player_row.user_id,
      (select array_agg(deck[i] order by deck[i]) from generate_series(player_row.seat*8+1,player_row.seat*8+8)i)
    );
  end loop;
  update tichu_players
  set grand_choice=null,grand_called=false,small_called=false,has_played=false,captured='{}',ready=false
  where room_id=p_room;
  update tichu_rooms
  set status='GRAND',round_no=round_no+1,turn_seat=null,lead=null,trick='[]',pass_count=0,
      wish_rank=null,last_trick_seat=null,dragon_pending_seat=null,dragon_target=null,
      revision=revision+1,updated_at=now()
  where id=p_room;
end $$;

revoke all on function public.tichu_start_room(uuid) from public,anon;
grant execute on function public.tichu_start_room(uuid) to authenticated;

commit;
