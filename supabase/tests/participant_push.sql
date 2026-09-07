-- Run as postgres. All test rows and outbound requests are rolled back.
begin;
do $$ begin
  if public.event_notification_label('2026-09-07 15:30:00+00','BOARDGAME') <> '9/8 보겜'
    or public.event_notification_label('2026-09-08 10:00:00+00','MURDER_MYSTERY') <> '9/8 머미'
    or public.event_notification_label('2026-09-08 10:00:00+00','CLOCKTOWER') <> '9/8 시계탑'
    or public.event_notification_label('2026-09-08 10:00:00+00','GENERAL') <> '9/8 일반' then raise exception 'Incorrect labels'; end if;
  if has_table_privilege('authenticated','public.push_settings','SELECT') or has_table_privilege('anon','public.push_subscriptions','SELECT') then raise exception 'Secrets exposed'; end if;
  if has_function_privilege('authenticated','public.claim_participant_push()','EXECUTE') or has_function_privilege('authenticated','public.create_member_notification(uuid,text,text,text,text,text)','EXECUTE') then raise exception 'Worker/notification RPC exposed'; end if;
  perform set_config('request.jwt.claim.sub','5aaef3b1-4235-49b2-a380-66c7d2adc999',true);
end $$;
set local role authenticated;
do $$ begin
  if (public.my_push_settings()->>'allowed')::boolean then raise exception 'Another account allowed'; end if;
  begin
    perform public.save_push_subscription('https://fcm.googleapis.com/test-only',repeat('A',87),repeat('A',22));
    raise exception 'Unexpected registration';
  exception when raise_exception then
    if sqlerrm='Unexpected registration' then raise; end if;
  end;
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claim.sub','330488c9-cce1-4758-a70a-3ff63b676ea8',true); end $$;
set local role authenticated;
do $$ begin
  if not (public.my_push_settings()->>'allowed')::boolean then raise exception 'Owner denied'; end if;
  perform public.save_push_subscription('https://fcm.googleapis.com/test-only',repeat('A',87),repeat('A',22));
  begin
    perform public.save_push_subscription('http://127.0.0.1/internal',repeat('A',87),repeat('A',22));
    raise exception 'Unexpected internal URL';
  exception when raise_exception then
    if sqlerrm='Unexpected internal URL' then raise; end if;
  end;
end $$;
reset role;
create temporary table push_test_participants(event_id uuid,user_id uuid);
create trigger push_test_participation after insert or delete on push_test_participants for each row execute function public.notify_event_participation();
do $$ declare e record; member uuid; before_count integer; after_count integer; begin
  select * into e from public.events order by started_at desc limit 1;
  select id into member from public.profiles where id<>'330488c9-cce1-4758-a70a-3ff63b676ea8' and id is distinct from e.created_by limit 1;
  if e.id is null or member is null then raise exception 'Test fixtures missing'; end if;
  select count(*) into before_count from public.push_deliveries;
  insert into push_test_participants values(e.id,member);
  select count(*) into after_count from public.push_deliveries;
  if after_count<>before_count+1 then raise exception 'Join not queued exactly once'; end if;
  if not exists(select 1 from public.push_deliveries where subscription_id=(select id from public.push_subscriptions where endpoint='https://fcm.googleapis.com/test-only') and message like '%'||public.event_notification_label(e.started_at,e.event_kind::text)||'에 참가했습니다.') then raise exception 'Queue wording incorrect'; end if;
  delete from push_test_participants;
  if (select count(*) from public.push_deliveries)<>after_count then raise exception 'Cancellation incorrectly pushed'; end if;
end $$;
rollback;
select 'Labels, account restriction, secret protection, endpoint validation, join queue, and cancellation exclusion passed' as verification;
