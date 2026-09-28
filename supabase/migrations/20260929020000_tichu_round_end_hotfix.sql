begin;

create or replace function public.tichu_end_round(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  first_user uuid;
  last_user uuid;
  last_team int;
  receiver uuid;
  sky int:=0;
  pink int:=0;
  player_row record;
  bonus int;
  room_row tichu_rooms%rowtype;
  double_team int;
  hist jsonb;
begin
  select * into room_row from tichu_rooms where id=p_room for update;
  select user_id into first_user from tichu_finished where room_id=p_room and finish_order=1;
  select tp.user_id,tp.team into last_user,last_team
  from tichu_players tp
  where tp.room_id=p_room
    and not exists(select 1 from tichu_finished f where f.room_id=tp.room_id and f.user_id=tp.user_id);

  select tp.team into double_team
  from tichu_finished f
  join tichu_players tp using(room_id,user_id)
  where f.room_id=p_room and f.finish_order in(1,2)
  group by tp.team having count(*)=2;

  if double_team is not null then
    if double_team=0 then sky:=200; else pink:=200; end if;
  else
    select user_id into receiver from tichu_players where room_id=p_room and team<>last_team order by seat limit 1;
    update tichu_players set captured=captured||(select cards from tichu_hands where room_id=p_room and user_id=last_user) where room_id=p_room and user_id=receiver;
    update tichu_players set captured=captured||(select captured from tichu_players where room_id=p_room and user_id=last_user) where room_id=p_room and user_id=first_user;
    for player_row in select team,captured from tichu_players where room_id=p_room loop
      if player_row.team=0 then sky:=sky+tichu_card_points(player_row.captured); else pink:=pink+tichu_card_points(player_row.captured); end if;
    end loop;
  end if;

  for player_row in select * from tichu_players where room_id=p_room loop
    bonus:=case when player_row.grand_called then 200 when player_row.small_called then 100 else 0 end;
    if bonus>0 and player_row.user_id<>first_user then bonus:=-bonus; end if;
    if player_row.team=0 then sky:=sky+bonus; else pink:=pink+bonus; end if;
  end loop;

  hist:=jsonb_build_object('round',room_row.round_no,'sky',sky,'pink',pink,'first_user',first_user);
  update tichu_rooms set
    sky_score=sky_score+sky,
    pink_score=pink_score+pink,
    round_history=round_history||jsonb_build_array(hist),
    status=case when (sky_score+sky>=target_score or pink_score+pink>=target_score) and sky_score+sky<>pink_score+pink then 'FINISHED' else 'ROUND_END' end,
    winner_team=case when (sky_score+sky>=target_score or pink_score+pink>=target_score) and sky_score+sky<>pink_score+pink then case when sky_score+sky>pink_score+pink then 0 else 1 end else null end,
    turn_seat=null,
    turn_deadline=null,
    revision=revision+1,
    updated_at=now()
  where id=p_room;
end $$;

revoke all on function public.tichu_end_round(uuid) from public,anon;
grant execute on function public.tichu_end_round(uuid) to authenticated;

commit;
