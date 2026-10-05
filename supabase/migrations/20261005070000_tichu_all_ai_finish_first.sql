begin;

-- Every difficulty has the same primary objective: empty its hand. Difficulty
-- still affects declarations, exchange, teammate support and tactical ties,
-- but blocking an opponent or holding a strong lead may not outrank the
-- estimated number of turns left in the bot's own hand.
do $$
declare
  fn text;
  changed text;
begin
  select pg_get_functiondef(
    'public.tichu_god_counted_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;

  changed := regexp_replace(
    fn,
    'finish_cost::numeric,\s*\(case when threat_tier >= 2 then response_risk else 0 end\)::numeric,\s*remaining_turns::numeric,',
    E'finish_cost::numeric,\n        remaining_turns::numeric,\n        (case when threat_tier >= 2 then response_risk else 0 end)::numeric,',
    'n'
  );
  changed := regexp_replace(
    changed,
    'finish_cost::numeric,\s*\(case when threat_tier = 3 then response_risk else 0 end\)::numeric,\s*\(case when threat_tier = 3 then -strength else strength end\)::numeric,\s*\(case when \(made->>''bomb''\)::boolean and threat_tier < 3 then 1 else 0 end\)::numeric,\s*remaining_turns::numeric,',
    E'finish_cost::numeric,\n        remaining_turns::numeric,\n        (case when threat_tier = 3 then response_risk else 0 end)::numeric,\n        (case when threat_tier = 3 then -strength else strength end)::numeric,\n        (case when (made->>''bomb'')::boolean and threat_tier < 3 then 1 else 0 end)::numeric,',
    'n'
  );
  if changed = fn then raise exception 'God finish-first priorities were not found'; end if;
  execute changed;

  select pg_get_functiondef(
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  changed := regexp_replace(
    fn,
    'finish_cost::numeric,\s*answerable::numeric,\s*shape_cost::numeric,\s*special_cost::numeric,',
    E'finish_cost::numeric,\n      shape_cost::numeric,\n      special_cost::numeric,\n      answerable::numeric,',
    'n'
  );
  if changed = fn then raise exception 'Deity finish-first priorities were not found'; end if;
  execute changed;

  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  if strpos(fn, 'All AI levels plan the shortest route out') = 0 then
    if strpos(fn, '-- God AI searches all legal combinations before the regular fallback logic.') = 0 then
      raise exception 'Common AI chooser insertion point not found';
    end if;
    fn := replace(
      fn,
      '-- God AI searches all legal combinations before the regular fallback logic.',
      E'-- All AI levels plan the shortest route out before tactical difficulty rules.\n  if bot.bot_difficulty in (''beginner'',''intermediate'',''advanced'') and not wish_legal then\n    chosen:=public.tichu_god_counted_play(p_room,bot.user_id,bot.team,hand_cards,room_row.lead,room_row.wish_rank);\n    if cardinality(chosen)>0 then\n      play_cards:=chosen; wish_combo:=public.tichu_classify_cards(play_cards,room_row.lead);\n      play_kind:=wish_combo->>''kind''; play_size:=(wish_combo->>''size'')::int;\n      play_strength:=(wish_combo->>''strength'')::numeric; play_bomb:=(wish_combo->>''bomb'')::boolean;\n    end if;\n  end if;\n\n  -- God AI searches all legal combinations before the regular fallback logic.'
    );
    execute fn;
  end if;
end;
$$;

commit;
