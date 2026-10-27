begin;
-- Automatic rooms judge true Gossip statements in their night task, not at execution.
do $migration$
declare source text; previous text := 'if exists(select 1 from public.clocktower_gossip where room_id=r.id and day=r.night and truth is null) then';
begin
 select pg_get_functiondef('public.clocktower_live_command_before_moon(uuid,text,jsonb)'::regprocedure) into source;
 if position(previous in source)=0 then raise exception 'Expected gossip guard not found'; end if;
 source := replace(source,previous,'if not coalesce((r.bmr_state->>''automated'')::boolean,false) and exists(select 1 from public.clocktower_gossip where room_id=r.id and day=r.night and truth is null) then');
 execute source;
end $migration$;
commit;
