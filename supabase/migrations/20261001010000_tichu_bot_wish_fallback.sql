begin;

do $$
declare
  fn text;
  old_logic text := E'  if room_row.wish_rank is not null then\n    play_cards:=public.tichu_wish_play(hand_cards,room_row.wish_rank,room_row.lead);\n    if cardinality(play_cards)>0 then wish_combo:=public.tichu_classify_cards(play_cards,room_row.lead); play_kind:=wish_combo->>''kind''; play_size:=(wish_combo->>''size'')::int; play_strength:=(wish_combo->>''strength'')::numeric; play_bomb:=(wish_combo->>''bomb'')::boolean; wish_legal:=true; end if;\n  end if;';
  new_logic text := E'  if room_row.wish_rank is not null then\n    chosen:=public.tichu_wish_play(hand_cards,room_row.wish_rank,room_row.lead);\n    if cardinality(chosen)>0 then play_cards:=chosen; wish_combo:=public.tichu_classify_cards(play_cards,room_row.lead); play_kind:=wish_combo->>''kind''; play_size:=(wish_combo->>''size'')::int; play_strength:=(wish_combo->>''strength'')::numeric; play_bomb:=(wish_combo->>''bomb'')::boolean; wish_legal:=true; end if;\n  end if;';
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;

  if strpos(fn,new_logic)>0 then
    return;
  end if;
  if strpos(fn,old_logic)=0 then
    raise exception 'Expected Tichu bot wish block was not found';
  end if;

  execute replace(fn,old_logic,new_logic);
end
$$;

commit;
