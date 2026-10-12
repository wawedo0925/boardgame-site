begin;
-- Publish only participant IDs at the corresponding announcement phase.
-- Never expose the private engine, roles, causes, or pending night deaths.
alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_before_public_outcomes;
revoke all on function public.clocktower_live_snapshot_before_public_outcomes(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s jsonb; r public.clocktower_live_rooms; night_ids jsonb:='[]'; day_ids jsonb:='[]';
begin
 s:=public.clocktower_live_snapshot_before_public_outcomes(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select * into r from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
 if r.phase='DAY' then
  if r.script='BMR' then
   select coalesce(jsonb_agg(distinct d->>'id'),'[]') into night_ids
   from jsonb_array_elements(coalesce(r.bmr_state#>'{auto,deaths}','[]')) d
   where d->>'night'=r.night::text and d->>'phase'='NIGHT'
    and exists(select 1 from public.clocktower_live_members m where m.room_id=r.id and m.user_id::text=d->>'id' and not m.public_alive);
  else
   select coalesce(jsonb_agg(d.key),'[]') into night_ids
   from jsonb_each(coalesce(r.night_engine->'deaths','{}')) d
   where d.value->>'night'=r.night::text
    and exists(select 1 from public.clocktower_live_members m where m.room_id=r.id and m.user_id::text=d.key and not m.public_alive);
  end if;
 elsif r.phase='NIGHT' and r.night>1 then
  if r.script='BMR' then
   select coalesce(jsonb_agg(distinct d->>'id'),'[]') into day_ids
   from jsonb_array_elements(coalesce(r.bmr_state#>'{auto,deaths}','[]')) d
   where d->>'night'=(r.night-1)::text and d->>'phase'='DAY';
  elsif r.night_engine#>>'{execution,night}'=(r.night-1)::text then
   day_ids:=jsonb_build_array(r.night_engine#>>'{execution,user_id}');
  end if;
 end if;
 return s||jsonb_build_object('public_outcomes',jsonb_build_object('night_deaths',night_ids,'day_deaths',day_ids));
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;
commit;
