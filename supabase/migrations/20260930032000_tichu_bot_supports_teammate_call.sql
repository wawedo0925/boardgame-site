do $migration$
declare
  original_definition text;
  updated_definition text;
  insertion_at int;
  lead_needle text := 'if room_row.lead is null then';
  lead_replacement text := E'if room_row.lead is null then\n    -- tichu teammate support policy: hand the lead to the caller whenever possible.\n    if 53=any(hand_cards) and cardinality(hand_cards)>1 and exists(\n      select 1 from tichu_players mate join tichu_hands mh using(room_id,user_id)\n      where mate.room_id=p_room and mate.team=bot.team and mate.user_id<>bot.user_id\n        and (mate.small_called or mate.grand_called) and cardinality(mh.cards)>0\n    ) then play_cards:=array[53];\n    else';
  bomb_needle text := 'if cardinality(play_cards)=0 and bot.bot_difficulty=''advanced'' and room_row.lead is not null and not coalesce((room_row.lead->>''bomb'')::boolean,false) then';
  bomb_replacement text := E'-- tichu teammate support policy: all AI levels protect a teammate''s call.\n  if room_row.lead is not null and cardinality(play_cards)>0\n     and not (has_wish and wish_legal)\n     and exists(\n       select 1 from tichu_players mate join tichu_hands mh using(room_id,user_id)\n       where mate.room_id=p_room and mate.team=bot.team and mate.user_id<>bot.user_id\n         and (mate.small_called or mate.grand_called) and cardinality(mh.cards)>0\n     )\n     and (leader_team=bot.team or cardinality(hand_cards)-cardinality(play_cards)<=1) then\n    play_cards=''{}'';\n  end if;\n\n  if cardinality(play_cards)=0 and bot.bot_difficulty=''advanced'' and room_row.lead is not null and not coalesce((room_row.lead->>''bomb'')::boolean,false) then';
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure)
  into original_definition;

  if position('tichu teammate support policy' in original_definition) > 0 then
    return;
  end if;

  insertion_at := strpos(original_definition, lead_needle);
  if insertion_at = 0 then
    raise exception 'Could not locate the bot lead decision block';
  end if;
  updated_definition := substr(original_definition, 1, insertion_at - 1)
    || lead_replacement
    || substr(original_definition, insertion_at + length(lead_needle));

  original_definition := updated_definition;
  insertion_at := strpos(original_definition, 'if cardinality(play_cards)=0 and bot.bot_difficulty<>''beginner'' then');
  if insertion_at = 0 then
    raise exception 'Could not close the bot support lead branch';
  end if;
  updated_definition := substr(original_definition, 1, insertion_at - 1)
    || E'end if;\n    if cardinality(play_cards)=0 and bot.bot_difficulty<>''beginner'' then'
    || substr(original_definition, insertion_at + length('if cardinality(play_cards)=0 and bot.bot_difficulty<>''beginner'' then'));

  original_definition := updated_definition;
  insertion_at := strpos(original_definition, bomb_needle);
  if insertion_at = 0 then
    raise exception 'Could not locate the bot play decision block';
  end if;
  updated_definition := substr(original_definition, 1, insertion_at - 1)
    || bomb_replacement
    || substr(original_definition, insertion_at + length(bomb_needle));

  execute updated_definition;
end
$migration$;
