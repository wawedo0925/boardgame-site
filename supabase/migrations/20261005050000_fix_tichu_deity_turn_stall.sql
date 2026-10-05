begin;

do $$
declare
  fn text;
begin
  select pg_get_functiondef(
    'public.tichu_god_counted_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  if strpos(fn, 'select value::int')=0 or
     strpos(fn, 'lateral jsonb_array_elements_text(play->''cards'') value')=0 then
    raise exception '신급 AI 공개 카드 집계 구문을 찾지 못했습니다.';
  end if;
  fn:=replace(fn,'select value::int','select trick_card.card_value::int');
  fn:=replace(
    fn,
    'lateral jsonb_array_elements_text(play->''cards'') value',
    'lateral jsonb_array_elements_text(play->''cards'') as trick_card(card_value)'
  );
  execute fn;
end;
$$;

commit;
