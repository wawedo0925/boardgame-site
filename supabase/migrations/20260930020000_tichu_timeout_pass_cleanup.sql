begin;

create or replace function public.tichu_timeout(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  r tichu_rooms%rowtype;
  active_count int;
  winner int;
begin
  perform tichu_assert_member(p_room);
  select * into r from tichu_rooms where id=p_room for update;
  if r.status<>'PLAYING' or r.turn_deadline is null or r.turn_deadline>now() then return; end if;

  if r.lead is null then
    update tichu_rooms
    set turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1
    where id=p_room;
    return;
  end if;

  select count(*) into active_count
  from tichu_hands where room_id=p_room and cardinality(cards)>0;

  if r.pass_count>=greatest(active_count-2,0) then
    winner:=r.last_trick_seat;
    update tichu_players
    set captured=captured||(
      select coalesce(array_agg(c::int),'{}')
      from jsonb_array_elements(r.trick)t
      cross join jsonb_array_elements_text(t->'cards')c
    )
    where room_id=p_room
      and (case when r.dragon_target is not null then user_id=r.dragon_target else seat=winner end);

    if not exists(
      select 1 from tichu_players p join tichu_hands h using(room_id,user_id)
      where p.room_id=p_room and p.seat=winner and cardinality(h.cards)>0
    ) then
      winner=tichu_next_seat(p_room,winner);
    end if;

    update tichu_rooms
    set turn_seat=winner,lead=null,trick='[]',pass_count=0,dragon_target=null,
        turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1
    where id=p_room;
  else
    update tichu_rooms
    set turn_seat=tichu_next_seat(p_room,r.turn_seat),pass_count=pass_count+1,
        turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1
    where id=p_room;
  end if;
end $$;

revoke all on function public.tichu_timeout(uuid) from public,anon;
grant execute on function public.tichu_timeout(uuid) to authenticated;

commit;
