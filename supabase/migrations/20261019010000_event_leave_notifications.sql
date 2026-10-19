begin;

-- Participant deletion already creates an inbox notice for the event creator.
-- Send it to the configured admin as well, and enable phone push for EVENT_LEFT.
do $$
declare fn text; changed text;
begin
  select pg_get_functiondef('public.notify_event_participation()'::regprocedure) into fn;
  changed:=regexp_replace(fn, 'if tg_op=''INSERT'' then[[:space:]]+select recipient_id', 'if tg_op in (''INSERT'',''DELETE'') then select recipient_id');
  if changed=fn then raise exception 'Participant admin notification hook not found'; end if;
  execute changed;

  select pg_get_functiondef('public.leave_event_with_refund(uuid,text,text,text)'::regprocedure) into fn;
  changed:=replace(fn, 'return request_id;', $patch$
  if request_id is null and result='WAITLIST_CANCELLED' then
    select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from public.profiles where id=u;
    for recipient in select user_id from public.site_roles where role='MAIN_ADMIN' loop
      perform public.create_member_notification(recipient,'EVENT_LEFT',
        case when result='WAITLIST_CANCELLED' then '대기 신청 취소' else '참가 취소' end,
        coalesce(member_name,'멤버')||'님이 '||e.title||
          case when result='WAITLIST_CANCELLED' then ' 대기 신청을 취소했습니다.' else ' 참가를 취소했습니다.' end,
        '/events/'||p_event_id,'event-left:'||p_event_id||':'||u||':'||gen_random_uuid());
    end loop;
  end if;
  return request_id;
  $patch$);
  if changed=fn then raise exception 'Cancellation notification hook not found'; end if;
  execute changed;

  select pg_get_functiondef('public.enqueue_participant_push()'::regprocedure) into fn;
  changed:=replace(fn, '''EVENT_JOINED'',''EVENT_REFUND'',''MEMBER_INQUIRY''', '''EVENT_JOINED'',''EVENT_REFUND'',''MEMBER_INQUIRY'',''EVENT_LEFT''');
  if changed=fn then raise exception 'Cancellation push hook not found'; end if;
  execute changed;
end;
$$;
commit;

