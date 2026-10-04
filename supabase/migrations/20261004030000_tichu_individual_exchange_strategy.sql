begin;

-- In individual mode there are no teammates. The original exchange policy
-- still compared the stored team column, so an AI could mistake an opponent
-- for a teammate and gift an A or another strong card.
do $$
declare
  fn text;
  old_advanced text := 'target.team=bot.team and bot.bot_difficulty in (''advanced'', ''god'') and c=53';
  old_advanced_array text := 'target.team=bot.team and bot.bot_difficulty = ANY (ARRAY[''advanced''::text, ''god''::text]) and c=53';
  old_original text := 'target.team=bot.team and bot.bot_difficulty=''advanced'' and c=53';
  old_support text := 'target.team=bot.team and bot.bot_difficulty<>''beginner''';
  new_advanced text := 'room_row.game_mode=''TEAM'' and target.team=bot.team and bot.bot_difficulty in (''advanced'', ''god'') and c=53';
  new_advanced_array text := 'room_row.game_mode=''TEAM'' and target.team=bot.team and bot.bot_difficulty = ANY (ARRAY[''advanced''::text, ''god''::text]) and c=53';
  new_original text := 'room_row.game_mode=''TEAM'' and target.team=bot.team and bot.bot_difficulty=''advanced'' and c=53';
  new_support text := 'room_row.game_mode=''TEAM'' and target.team=bot.team and bot.bot_difficulty<>''beginner''';
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;

  if strpos(fn, 'room_row.game_mode=''TEAM'' and target.team=bot.team') > 0 then
    return;
  end if;

  if strpos(fn, old_advanced_array) > 0 then
    fn := replace(fn, old_advanced_array, new_advanced_array);
  elsif strpos(fn, old_advanced) > 0 then
    fn := replace(fn, old_advanced, new_advanced);
  elsif strpos(fn, old_original) > 0 then
    fn := replace(fn, old_original, new_original);
  else
    raise exception 'Tichu AI teammate exchange strategy was not found';
  end if;

  if strpos(fn, old_support) = 0 then
    raise exception 'Tichu AI supportive exchange strategy was not found';
  end if;
  fn := replace(fn, old_support, new_support);

  execute fn;
end;
$$;

commit;
