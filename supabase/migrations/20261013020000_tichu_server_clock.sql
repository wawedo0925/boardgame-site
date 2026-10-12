begin;
do $$
declare fn text; changed text;
begin
  select pg_get_functiondef('public.tichu_snapshot(uuid)'::regprocedure) into fn;
  changed := replace(fn, '''room'',to_jsonb(r)', '''server_time'',clock_timestamp(),''room'',to_jsonb(r)');
  if changed = fn then raise exception 'Tichu snapshot clock insertion point not found'; end if;
  execute changed;
end;
$$;
commit;
