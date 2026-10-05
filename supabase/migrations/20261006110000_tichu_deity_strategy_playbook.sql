begin;

create or replace function public.tichu_deity_wish(p_room uuid, p_bot uuid)
returns int language sql stable security definer set search_path=public as $$
  select coalesce((
    select card/4+2
    from public.tichu_players p
    join public.tichu_hands h using(room_id,user_id)
    cross join unnest(h.cards) card
    where p.room_id=p_room and p.user_id<>p_bot and not p.is_bot and card<52
    group by card/4+2
    order by (card/4+2=14) desc, card/4+2 desc, count(*) desc
    limit 1
  ),14)
$$;
revoke all on function public.tichu_deity_wish(uuid,uuid) from public,anon,authenticated;

do $$
declare fn text; changed text;
begin
  select pg_get_functiondef(
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  changed:=regexp_replace(fn,'low_tail_cost\s+(int|integer);',E'low_tail_cost integer;\n  two_step_cost integer;\n  threat_block_cost integer;','in');
  changed:=regexp_replace(changed,'candidate_key\s*:=\s*array\[\s*finish_cost::numeric,\s*low_tail_cost::numeric,\s*exit_plan_cost::numeric,\s*control_gap::numeric,\s*shape_cost::numeric,\s*answerable::numeric,\s*special_cost::numeric,\s*-cardinality\(subset\)::numeric,\s*\(made->>''strength''\)::numeric\s*\];',E'two_step_cost:=case when cardinality(remainder)>0 and public.tichu_classify_cards(remainder,null) is not null and answerable=0 then 0 else 1 end;\n    threat_block_cost:=case when target_count<=3 then answerable else 0 end;\n    if n<=6 then\n      candidate_key:=array[finish_cost::numeric,threat_block_cost::numeric,two_step_cost::numeric,exit_plan_cost::numeric,control_gap::numeric,low_tail_cost::numeric,answerable::numeric,special_cost::numeric,-cardinality(subset)::numeric,(made->>''strength'')::numeric];\n    elsif p_lead is null then\n      candidate_key:=array[finish_cost::numeric,low_tail_cost::numeric,exit_plan_cost::numeric,control_gap::numeric,special_cost::numeric,answerable::numeric,(made->>''strength'')::numeric,-cardinality(subset)::numeric,shape_cost::numeric,two_step_cost::numeric];\n    else\n      candidate_key:=array[finish_cost::numeric,threat_block_cost::numeric,exit_plan_cost::numeric,control_gap::numeric,answerable::numeric,low_tail_cost::numeric,special_cost::numeric,(made->>''strength'')::numeric,-cardinality(subset)::numeric,two_step_cost::numeric];\n    end if;','in');
  changed:=replace(changed,'    shape_cost:=',E'    if n>6 then\n      special_cost:=special_cost+(case when 55=any(subset) then 15 else 0 end)+(case when 54=any(subset) then 8 else 0 end)+(case when (made->>''bomb'')::boolean then 18 else 0 end);\n    end if;\n    shape_cost:=');
  if changed=fn or strpos(changed,'two_step_cost')=0 then raise exception 'Deity strategy playbook was not installed'; end if;
  execute changed;

  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  if strpos(fn,'tichu_deity_wish')=0 then
    changed:=replace(fn,'when 52=any(play_cards) then 2+floor(random()*13)::int','when 52=any(play_cards) then case when bot.bot_difficulty=''deity'' then public.tichu_deity_wish(p_room,bot.user_id) else 2+floor(random()*13)::int end');
    if changed=fn then raise exception 'Deity wish insertion point not found'; end if;
    execute changed;
  end if;
end;
$$;

commit;
