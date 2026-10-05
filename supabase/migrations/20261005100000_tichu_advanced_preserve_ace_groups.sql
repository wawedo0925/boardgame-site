begin;

-- Advanced and stronger bots preserve multiple Aces as separate controls.
-- They may spend an AA/AAA/AAAA group only when the complete remainder is one
-- legal combination, so the bot can finish on its very next lead.
do $$
declare fn text; changed text;
begin
  select pg_get_functiondef(
    'public.tichu_god_counted_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  changed:=replace(fn,
    '(select count(*) from unnest(subset) card where card between 48 and 51) >= 2',
    '(select count(*) from unnest(subset) card where card between 48 and 51) >= 2 and public.tichu_classify_cards(array(select c from unnest(p_hand)c where not c=any(subset)),null) is null');
  if changed=fn then raise exception 'God Ace-group rule was not found'; end if;
  execute changed;

  select pg_get_functiondef(
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  changed:=replace(fn,
    '(select count(*) from unnest(subset)c where c between 48 and 51)>=2',
    '(select count(*) from unnest(subset)c where c between 48 and 51)>=2 and public.tichu_classify_cards(array(select c from unnest(p_hand)c where not c=any(subset)),null) is null');
  if changed=fn then raise exception 'Deity Ace-group rule was not found'; end if;
  execute changed;

  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  if strpos(fn,'Advanced-plus Ace group final guard')=0 then
    changed:=regexp_replace(fn,
      'if cardinality\(play_cards\)=0 then\s*select count\(\*\) into active_count',
      E'-- Advanced-plus Ace group final guard.\n  if bot.bot_difficulty in (''advanced'',''god'',''deity'')\n    and (select count(*) from unnest(play_cards)c where c between 48 and 51)>=2\n    and cardinality(play_cards)<cardinality(hand_cards)\n    and public.tichu_classify_cards(array(select c from unnest(hand_cards)c where not c=any(play_cards)),null) is null\n  then play_cards=''{}''; end if;\n\n  if cardinality(play_cards)=0 then\n    select count(*) into active_count','n');
    if changed=fn then raise exception 'Ace-group final guard insertion point not found'; end if;
    execute changed;
  end if;
end;
$$;

commit;
