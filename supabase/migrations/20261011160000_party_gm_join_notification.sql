begin;
-- Reuse the existing inbox/push notification, preserving late-arrival handling.
do $$
declare source text; anchor text;
begin
 source:=pg_get_functiondef('public.notify_event_participation()'::regprocedure);
 anchor:=$block$dedupe:='participant:'$block$;
 if position(anchor in source)=0 then
   raise exception 'Unexpected participation notification function; migration aborted';
 end if;
 if position('party_gm_join_notification' in source)=0 then
   source:=replace(source,anchor,$block$-- party_gm_join_notification
  if tg_op='INSERT' and e.event_kind::text='BOARDGAME' and exists(
    select 1 from public.event_party_gm_requests r where r.event_id=e.id and r.user_id=member_id
  ) then
    heading:='GM으로 참가';
    message:=coalesce(member_name,'멤버')||'님이 '||public.event_notification_label(e.started_at,e.event_kind::text)||'에 GM으로 참가했습니다.';
  end if;
  $block$||anchor);
   execute source;
 end if;
end $$;
commit;
