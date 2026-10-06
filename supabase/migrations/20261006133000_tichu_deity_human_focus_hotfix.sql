begin;

-- Keep the challenge focused on the human player.  Exact subset enumeration
-- is affordable for one hand, while enumerating all three opponents caused the
-- bot tick to exceed the hosted statement timeout.  AI opponents still affect
-- the imminent-finish threat count, but their complete combination trees are
-- not searched.
do $$
declare
  fn text;
  changed text;
  all_target text := E'select h.cards, cardinality(h.cards) into target_hand, target_count\n  from public.tichu_players p join public.tichu_hands h using(room_id,user_id)\n  where p.room_id=p_room and p.user_id<>p_bot and cardinality(h.cards)>0\n  order by cardinality(h.cards), ((p.seat-bot_seat+4)%4) limit 1;\n  if target_hand is null then return base_play; end if;';
  human_target text := E'select h.cards, cardinality(h.cards) into target_hand, target_count\n  from public.tichu_players p join public.tichu_hands h using(room_id,user_id)\n  where p.room_id=p_room and p.user_id<>p_bot and not p.is_bot and cardinality(h.cards)>0\n  order by cardinality(h.cards), ((p.seat-bot_seat+4)%4) limit 1;\n  if target_hand is null then return base_play; end if;\n  select min(cardinality(h.cards)) into target_count\n  from public.tichu_players p join public.tichu_hands h using(room_id,user_id)\n  where p.room_id=p_room and p.user_id<>p_bot and cardinality(h.cards)>0;';
begin
  select pg_get_functiondef(
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;

  changed := replace(fn, E'  opponent record;\n', '');
  changed := replace(changed, all_target, human_target);
  changed := regexp_replace(
    changed,
    'for opponent in\n\s*select h.cards.*?\n\s*wish_required :=',
    E'hn:=cardinality(target_hand);\n  for mask in 1..(power(2,hn)::int-1) loop\n    subset:=''{}'';\n    for i in 1..hn loop\n      if (mask/power(2,i-1)::int)%2=1 then subset:=array_append(subset,target_hand[i]); end if;\n    end loop;\n    if 53=any(subset) then continue; end if;\n    made:=public.tichu_classify_cards(subset,null);\n    if made is null then continue; end if;\n    if (made->>''bomb'')::boolean then\n      if made->>''kind''=''four'' then bomb_four:=greatest(bomb_four,(made->>''strength'')::numeric);\n      elsif (made->>''size'')::int>bomb_straight_size or ((made->>''size'')::int=bomb_straight_size and (made->>''strength'')::numeric>bomb_straight_strength) then\n        bomb_straight_size:=(made->>''size'')::int; bomb_straight_strength:=(made->>''strength'')::numeric;\n      end if;\n    else\n      key_name:=(made->>''kind'')||'':''||(made->>''size'');\n      ceilings:=jsonb_set(ceilings,array[key_name],to_jsonb(greatest(coalesce((ceilings->>key_name)::numeric,0),(made->>''strength'')::numeric)),true);\n    end if;\n  end loop;\n\n  wish_required :=',
    'ins'
  );

  if changed = fn or strpos(changed, 'for opponent in') > 0 or
     strpos(changed, 'not p.is_bot') = 0 then
    raise exception '티츄신 사람 집중 탐색 최적화를 설치하지 못했습니다.';
  end if;
  execute changed;
end;
$$;

commit;
