begin;

create or replace function public.tichu_end_round(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare first_user uuid; last_user uuid; last_team int; receiver uuid; sky int:=0; pink int:=0; p record; bonus int; r tichu_rooms%rowtype; double_team int; hist jsonb; round_score int; scores jsonb:='{}'; top_score int; top_count int; winner uuid;
begin
  select * into r from tichu_rooms where id=p_room for update;
  select user_id into first_user from tichu_finished where room_id=p_room and finish_order=1;
  select tp.user_id,tp.team into last_user,last_team from tichu_players tp where tp.room_id=p_room and not exists(select 1 from tichu_finished f where f.room_id=tp.room_id and f.user_id=tp.user_id);
  if r.game_mode='INDIVIDUAL' then
    if last_user is not null then
      insert into tichu_finished(room_id,user_id,finish_order) values(p_room,last_user,4) on conflict do nothing;
      update tichu_players set captured=captured||coalesce((select cards from tichu_hands where room_id=p_room and user_id=last_user),'{}')||coalesce((select captured from tichu_players where room_id=p_room and user_id=last_user),'{}') where room_id=p_room and user_id=first_user;
      update tichu_players set captured='{}' where room_id=p_room and user_id=last_user and user_id<>first_user;
    end if;
    for p in select tp.*,f.finish_order from tichu_players tp join tichu_finished f using(room_id,user_id) where tp.room_id=p_room loop
      round_score:=public.tichu_card_points(p.captured)+case p.finish_order when 1 then 80 when 2 then 50 when 3 then 20 else 0 end;
      bonus:=case when p.grand_called then 200 when p.small_called then 100 else 0 end;
      if bonus>0 and p.finish_order<>1 then bonus:=-bonus; end if;
      round_score:=round_score+bonus;
      update tichu_players set score=score+round_score where room_id=p_room and user_id=p.user_id;
      scores:=scores||jsonb_build_object(p.user_id::text,round_score);
    end loop;
    update tichu_players set ready=is_bot where room_id=p_room;
    select max(score) into top_score from tichu_players where room_id=p_room;
    select count(*) into top_count from tichu_players where room_id=p_room and score=top_score;
    select user_id into winner from tichu_players where room_id=p_room and score=top_score order by seat limit 1;
    hist:=jsonb_build_object('round',r.round_no,'individual',scores,'first_user',first_user);
    update tichu_rooms set round_history=round_history||jsonb_build_array(hist),status=case when top_score>=target_score and top_count=1 then 'FINISHED' else 'ROUND_END' end,winner_user_id=case when top_score>=target_score and top_count=1 then winner else null end,winner_team=null,turn_seat=null,turn_deadline=null,revision=revision+1,updated_at=now() where id=p_room;
    return;
  end if;
  select tp.team into double_team from tichu_finished f join tichu_players tp using(room_id,user_id) where f.room_id=p_room and f.finish_order in(1,2) group by tp.team having count(*)=2;
  if double_team is not null then if double_team=0 then sky:=200; else pink:=200; end if;
  else
    select user_id into receiver from tichu_players where room_id=p_room and team<>last_team order by seat limit 1;
    update tichu_players set captured=captured||(select cards from tichu_hands where room_id=p_room and user_id=last_user) where room_id=p_room and user_id=receiver;
    update tichu_players set captured=captured||(select captured from tichu_players where room_id=p_room and user_id=last_user) where room_id=p_room and user_id=first_user;
    for p in select team,captured from tichu_players where room_id=p_room loop if p.team=0 then sky:=sky+tichu_card_points(p.captured); else pink:=pink+tichu_card_points(p.captured); end if; end loop;
  end if;
  for p in select * from tichu_players where room_id=p_room loop bonus:=case when p.grand_called then 200 when p.small_called then 100 else 0 end; if bonus>0 and p.user_id<>first_user then bonus:=-bonus; end if; if p.team=0 then sky:=sky+bonus; else pink:=pink+bonus; end if; end loop;
  update tichu_players set ready=is_bot where room_id=p_room;
  hist:=jsonb_build_object('round',r.round_no,'sky',sky,'pink',pink,'first_user',first_user);
  update tichu_rooms set sky_score=sky_score+sky,pink_score=pink_score+pink,round_history=round_history||jsonb_build_array(hist),status=case when (sky_score+sky>=target_score or pink_score+pink>=target_score) and sky_score+sky<>pink_score+pink then 'FINISHED' else 'ROUND_END' end,winner_team=case when (sky_score+sky>=target_score or pink_score+pink>=target_score) and sky_score+sky<>pink_score+pink then case when sky_score+sky>pink_score+pink then 0 else 1 end else null end,turn_seat=null,turn_deadline=null,revision=revision+1,updated_at=now() where id=p_room;
end $$;

-- Existing rooms that are already waiting at a round boundary should not be
-- blocked by bots whose ready flag was cleared by the previous implementation.
update public.tichu_players p
set ready=true
from public.tichu_rooms r
where p.room_id=r.id and p.is_bot and r.status='ROUND_END';

revoke all on function public.tichu_end_round(uuid) from public,anon;
grant execute on function public.tichu_end_round(uuid) to authenticated;

commit;
