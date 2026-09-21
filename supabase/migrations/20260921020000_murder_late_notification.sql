begin;
-- The participant INSERT emits both inbox and push notifications. Store the
-- validated arrival before that INSERT, in the same transaction.
do $$
declare source text; plan_write text;
begin
 source:=pg_get_functiondef('public.join_event_with_arrival(uuid,timestamptz,text)'::regprocedure);
 plan_write:=$block$ insert into public.event_arrival_plans(event_id,user_id,arrival_at,arrival_mode)
 values(p_event_id,u,p_arrival_at,p_arrival_mode)
 on conflict(event_id,user_id) do update set arrival_at=excluded.arrival_at,arrival_mode=excluded.arrival_mode;
$block$;
 if position(plan_write in source)=0 or position(' result:=public.join_event_with_capacity(p_event_id);' in source)=0 then
   raise exception 'Unexpected arrival function; migration aborted';
 end if;
 source:=replace(source,plan_write,'');
 source:=replace(source,' result:=public.join_event_with_capacity(p_event_id);',plan_write||' result:=public.join_event_with_capacity(p_event_id);');
 execute source;
end $$;

do $$
declare source text; anchor text;
begin
 source:=pg_get_functiondef('public.notify_event_participation()'::regprocedure);
 anchor:=$block$dedupe:='participant:'$block$;
 if position(anchor in source)=0 then raise exception 'Unexpected participation notification function; migration aborted'; end if;
 source:=replace(source,anchor,$block$  if tg_op='INSERT' and e.event_kind::text='MURDER_MYSTERY' then
    if exists(select 1 from public.event_arrival_plans a where a.event_id=e.id and a.user_id=member_id and a.arrival_at>e.started_at) then
      heading:='늦참 · '||heading;
      message:=message||' (늦참 · '||(select to_char(a.arrival_at at time zone 'Asia/Seoul','HH24:MI') from public.event_arrival_plans a where a.event_id=e.id and a.user_id=member_id)||' 도착 예정)';
    end if;
  end if;
$block$||anchor);
 execute source;
end $$;
commit;
