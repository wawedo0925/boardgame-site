begin;
-- Preserve existing API privileges and masking; expose tokens only for publicly dead members.
create or replace function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; rid uuid; items jsonb; roster jsonb;
begin
 s:=public.clocktower_live_snapshot_v4(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 rid:=(s->'room'->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 perform public.clocktower_finish_votes(rid);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'day',day,'nominator',nominator,'nominee',nominee,'status',status,'voter_order',voter_order,'started_at',started_at,'threshold',threshold,'ballots',ballots) order by created_at),'[]') into items from public.clocktower_live_votes where room_id=rid and day=(s->'room'->>'night')::integer;
 select coalesce(jsonb_agg(item.value||case when (item.value->>'alive')::boolean=false then jsonb_build_object('ghost_vote_used',m.ghost_vote_used) else '{}'::jsonb end order by item.ordinality),'[]') into roster
 from jsonb_array_elements(s->'members') with ordinality item(value,ordinality)
 join public.clocktower_live_members m on m.room_id=rid and m.user_id=(item.value->>'user_id')::uuid;
 s:=jsonb_set(s,'{members}',roster);
 return s||jsonb_build_object('votes',items,'server_now',clock_timestamp(),'ghost_vote_used',coalesce((select ghost_vote_used from public.clocktower_live_members where room_id=rid and user_id=auth.uid()),false));
end $$;
commit;
