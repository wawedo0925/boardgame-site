begin;

-- Ordinary AI rooms have no deity bonus. Applying the zero-power-card rule
-- there can never succeed when an already visible opening contains A/Dragon.
-- Keep the original eight cards and all existing God/Deity balancing rules.
do $$
declare fn text; changed text;
begin
  select pg_get_functiondef('public.tichu_apply_god_opening_handicap()'::regprocedure) into fn;
  changed := replace(fn,
    'if player_row.user_id = human_id then',
    'if deity_id is not null and player_row.user_id = human_id then');
  if changed = fn then
    raise exception 'Tichu deity-only bonus condition was not found';
  end if;
  execute changed;
end;
$$;

commit;
