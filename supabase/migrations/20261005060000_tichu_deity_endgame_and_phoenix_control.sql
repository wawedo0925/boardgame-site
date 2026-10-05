begin;

-- The challenge AI used to rank an unanswerable play ahead of preserving its
-- route out.  That made it burn the Phoenix in a large opening straight and
-- leave an awkward tail. Keep the exact counter search, but protect the
-- Phoenix until it can create a short, realistic route out.
do $$
declare
  fn text;
  classify_marker text := '    if made is null then continue; end if;';
  phoenix_guard text := E'    if made is null then continue; end if;\n\n    -- Do not spend Phoenix on an early opening combination that still leaves\n    -- a long tail. It is more valuable later as a bridge or control card.\n    if p_lead is null and n > 6 and 54 = any(subset)\n      and cardinality(subset) < n and n - cardinality(subset) > 3\n    then continue; end if;';
begin
  select pg_get_functiondef(
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;

  if strpos(fn, 'Do not spend Phoenix on an early opening combination') = 0 then
    if strpos(fn, classify_marker) = 0 then
      raise exception 'Deity Phoenix guard insertion point not found';
    end if;
    fn := replace(fn, classify_marker, phoenix_guard);
  end if;
  execute fn;
end;
$$;

commit;
