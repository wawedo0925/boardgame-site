begin;

-- A theoretically completable route can still lose when a weak isolated card
-- is kept until opponents have already gone out. Clear low tail cards while
-- the bot has a lead, then retain high controls for the closing sequence.
do $$
declare fn text; changed text;
begin
  select pg_get_functiondef(
    'public.tichu_god_counted_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  changed:=regexp_replace(fn,'exit_plan_cost\s+(int|integer);',E'exit_plan_cost integer;\n  low_tail_cost integer;','in');
  changed:=replace(changed,'    control_gap := greatest(',E'    select coalesce(sum(8-low_singles.low_rank),0) into low_tail_cost from (\n      select c/4+2 low_rank from unnest(remainder)c where c<52 and c/4+2<=7\n      group by c/4+2 having count(*)=1\n    ) low_singles;\n    low_tail_cost:=low_tail_cost*case when n<=8 then 3 else 1 end;\n\n    control_gap := greatest(');
  changed:=regexp_replace(changed,
    'finish_cost::numeric,\s*exit_plan_cost::numeric,',
    E'finish_cost::numeric,\n        low_tail_cost::numeric,\n        exit_plan_cost::numeric,','n');
  if changed=fn or strpos(changed,'low_tail_cost')=0 then raise exception 'God low-tail planner was not installed'; end if;
  execute changed;

  select pg_get_functiondef(
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  changed:=regexp_replace(fn,'exit_plan_cost\s+(int|integer);',E'exit_plan_cost integer;\n  low_tail_cost integer;','in');
  changed:=replace(changed,'    control_gap:=greatest(',E'    select coalesce(sum(8-low_singles.low_rank),0) into low_tail_cost from (\n      select c/4+2 low_rank from unnest(remainder)c where c<52 and c/4+2<=7\n      group by c/4+2 having count(*)=1\n    ) low_singles;\n    low_tail_cost:=low_tail_cost*case when n<=8 then 3 else 1 end;\n    control_gap:=greatest(');
  changed:=regexp_replace(changed,
    'finish_cost::numeric,\s*exit_plan_cost::numeric,',
    E'finish_cost::numeric,\n      low_tail_cost::numeric,\n      exit_plan_cost::numeric,','n');
  if changed=fn or strpos(changed,'low_tail_cost')=0 then raise exception 'Deity low-tail planner was not installed'; end if;
  execute changed;
end;
$$;

commit;
