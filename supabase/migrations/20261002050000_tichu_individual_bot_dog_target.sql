begin;

-- In individual games a bot has no teammate. Give the Dog lead to the next
-- active player, and finish the round instead of leaving turn_seat null when
-- nobody remains.
do $$
declare
  fn text;
  old_dog text := 'if room_row.game_mode=''INDIVIDUAL'' then next_seat:=tichu_next_seat(p_room,bot.seat); else select seat into next_seat from tichu_players where room_id=p_room and team=bot.team and user_id<>bot.user_id; end if;';
  new_dog text := 'if room_row.game_mode=''INDIVIDUAL'' then select p.seat into next_seat from tichu_players p join tichu_hands h using(room_id,user_id) where p.room_id=p_room and p.user_id<>bot.user_id and cardinality(h.cards)>0 order by ((p.seat-bot.seat+4)%4) limit 1; if next_seat is null then perform tichu_end_round(p_room); return; end if; else select seat into next_seat from tichu_players where room_id=p_room and team=bot.team and user_id<>bot.user_id; end if;';
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  if strpos(fn, old_dog)=0 then
    raise exception 'Tichu individual bot Dog insertion point not found';
  end if;
  execute replace(fn, old_dog, new_dog);
end $$;

commit;
