begin;

do $$
declare
  fn text;
  marker text := '-- tichu teammate support policy: all AI levels protect a teammate''s call.';
  policy text := E'  -- Do not overtake a teammate''s J-or-higher lead unless this bot has declared Tichu.\n  if room_row.game_mode=''TEAM'' and room_row.lead is not null\n     and leader_team=bot.team and lead_strength>=11\n     and not (bot.small_called or bot.grand_called)\n     and not (has_wish and wish_legal) then\n    play_cards=''{}'';\n  end if;\n\n  ';
  advanced_plain text := 'elsif bot.bot_difficulty in (''advanced'', ''god'') and leader_team=bot.team and not (has_wish and wish_legal) then';
  advanced_array text := 'elsif bot.bot_difficulty = ANY (ARRAY[''advanced''::text, ''god''::text]) and leader_team=bot.team and not (has_wish and wish_legal) then';
  advanced_original text := 'elsif bot.bot_difficulty=''advanced'' and leader_team=bot.team and not (has_wish and wish_legal) then';
  advanced_plain_new text := 'elsif bot.bot_difficulty in (''advanced'', ''god'') and leader_team=bot.team and not (bot.small_called or bot.grand_called) and not (has_wish and wish_legal) then';
  advanced_array_new text := 'elsif bot.bot_difficulty = ANY (ARRAY[''advanced''::text, ''god''::text]) and leader_team=bot.team and not (bot.small_called or bot.grand_called) and not (has_wish and wish_legal) then';
  advanced_original_new text := 'elsif bot.bot_difficulty=''advanced'' and leader_team=bot.team and not (bot.small_called or bot.grand_called) and not (has_wish and wish_legal) then';
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;

  if strpos(fn, 'Do not overtake a teammate''s J-or-higher lead') = 0 then
    if strpos(fn, marker) = 0 then
      raise exception 'Tichu teammate support insertion point was not found';
    end if;
    fn := replace(fn, marker, policy || marker);
  end if;

  -- Advanced and God normally pass any teammate lead. Let a bot that declared
  -- Tichu continue into its normal response logic instead.
  if strpos(fn, advanced_array) > 0 then
    fn := replace(fn, advanced_array, advanced_array_new);
  elsif strpos(fn, advanced_plain) > 0 then
    fn := replace(fn, advanced_plain, advanced_plain_new);
  elsif strpos(fn, advanced_original) > 0 then
    fn := replace(fn, advanced_original, advanced_original_new);
  else
    raise exception 'Tichu advanced teammate lead branch was not found';
  end if;

  execute fn;
end;
$$;

commit;
