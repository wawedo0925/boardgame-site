begin;

-- A short hand is not automatically a good hand: after unloading a combo the
-- bot may need to win the lead again for every remaining group. Score the
-- whole exit route by combining remaining groups with retained control cards.
do $$
declare fn text; changed text;
begin
  select pg_get_functiondef(
    'public.tichu_god_counted_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  changed:=regexp_replace(fn,'retained_control\s+(int|integer);',E'retained_control integer;\n  control_gap integer;\n  exit_plan_cost integer;','in');
  changed:=replace(changed,'    special_cost :=',E'    -- A remaining group needs a future lead. The current opening lead counts\n    -- as one opportunity; retained A/Dragon/Phoenix cards can recover more.\n    control_gap := greatest(remaining_turns - retained_control\n      - case when p_lead is null then 1 else 0 end, 0);\n    exit_plan_cost := remaining_turns + control_gap * 3;\n\n    special_cost :=');
  changed:=regexp_replace(changed,
    'finish_cost::numeric,\s*remaining_turns::numeric,\s*\(case when threat_tier >= 2 then response_risk else 0 end\)::numeric,',
    E'finish_cost::numeric,\n        exit_plan_cost::numeric,\n        control_gap::numeric,\n        remaining_turns::numeric,\n        (case when threat_tier >= 2 then response_risk else 0 end)::numeric,','n');
  changed:=regexp_replace(changed,
    'finish_cost::numeric,\s*remaining_turns::numeric,\s*\(case when threat_tier = 3 then response_risk else 0 end\)::numeric,',
    E'finish_cost::numeric,\n        exit_plan_cost::numeric,\n        control_gap::numeric,\n        remaining_turns::numeric,\n        (case when threat_tier = 3 then response_risk else 0 end)::numeric,','n');
  if changed=fn then raise exception 'God exit-route planner insertion points not found'; end if;
  if strpos(changed,'exit_plan_cost')=0 then raise exception 'God exit-route planner was not installed'; end if;
  execute changed;

  select pg_get_functiondef(
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  changed:=regexp_replace(fn,'shape_cost\s+(int|integer);',E'shape_cost integer;\n  remainder integer[];\n  rank_no integer;\n  rank_groups integer;\n  longest_run integer;\n  current_run integer;\n  remaining_turns integer;\n  retained_control integer;\n  control_gap integer;\n  exit_plan_cost integer;','in');
  changed:=regexp_replace(changed,'candidate_key\s*:=\s*array\[',E'remainder:=array(select c from unnest(p_hand)c where not c=any(subset));\n    select count(distinct c/4+2)+count(*) filter(where c>=52) into rank_groups from unnest(remainder)c;\n    longest_run:=0; current_run:=0;\n    for rank_no in 2..14 loop\n      if exists(select 1 from unnest(remainder)c where c<52 and c/4+2=rank_no) then\n        current_run:=current_run+1; longest_run:=greatest(longest_run,current_run);\n      else current_run:=0; end if;\n    end loop;\n    remaining_turns:=greatest(rank_groups-case when longest_run>=5 then longest_run-1 else 0 end,0);\n    retained_control:=(select count(*) from unnest(remainder)c where c between 48 and 51)\n      +case when 55=any(remainder) then 2 else 0 end\n      +case when 54=any(remainder) then 1 else 0 end;\n    control_gap:=greatest(remaining_turns-retained_control-case when p_lead is null then 1 else 0 end,0);\n    exit_plan_cost:=remaining_turns+control_gap*3;\n\n    candidate_key:=ARRAY[','in');
  changed:=regexp_replace(changed,
    'finish_cost::numeric,\s*shape_cost::numeric,\s*special_cost::numeric,\s*answerable::numeric,',
    E'finish_cost::numeric,\n      exit_plan_cost::numeric,\n      control_gap::numeric,\n      shape_cost::numeric,\n      answerable::numeric,\n      special_cost::numeric,','n');
  if changed=fn then raise exception 'Deity exit-route planner insertion points not found'; end if;
  if strpos(changed,'exit_plan_cost')=0 then raise exception 'Deity exit-route planner was not installed'; end if;
  execute changed;
end;
$$;

commit;
