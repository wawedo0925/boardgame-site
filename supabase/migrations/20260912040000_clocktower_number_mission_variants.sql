begin;
-- Validate against the saved challenge, including older ten-number missions.
do $migration$
declare definition text; signature text;
begin
 signature := 'public.clocktower_live_command_v5(uuid,text,jsonb)';
 definition := pg_get_functiondef(signature::regprocedure);
 if position($old$then '1,2,3,4,5,6,7,8,9,10' else m.challenge->>'text'$old$ in definition)=0 then
  raise exception 'Expected number mission validator was not found';
 end if;
 definition := replace(definition,
  $old$then '1,2,3,4,5,6,7,8,9,10' else m.challenge->>'text'$old$,
  $new$then (select string_agg(tile, ',' order by tile::integer) from jsonb_array_elements_text(m.challenge->'tiles') as t(tile)) else m.challenge->>'text'$new$);
 execute definition;
 -- Each player's challenge chooses its length independently, then shuffles tiles.
 foreach signature in array array[
  'public.clocktower_make_missions(public.clocktower_live_rooms,integer)',
  'public.clocktower_cover_missions()'
 ] loop
  definition := pg_get_functiondef(signature::regprocedure);
  if position('generate_series(1,10)' in definition)=0 then
   raise exception 'Expected number mission generator was not found: %',signature;
  end if;
  execute replace(definition,'generate_series(1,10)',
   'generate_series(1,case when random()<0.5 then 3 else 5 end)');
 end loop;
end $migration$;
commit;
