begin;
create extension if not exists pg_net with schema extensions;

create table public.push_settings (
  id boolean primary key default true check (id),
  recipient_id uuid not null references auth.users(id),
  worker_url text not null,
  worker_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  public_key text,
  private_key text
);
insert into public.push_settings(id,recipient_id,worker_url) values
  (true,'330488c9-cce1-4758-a70a-3ff63b676ea8','https://rfigrunwjchibghcckxx.supabase.co/functions/v1/participant-push');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  title text not null,
  message text not null,
  link text not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(subscription_id,notification_id)
);
create index push_pending on public.push_deliveries(next_attempt_at) where sent_at is null and attempts < 5;
alter table public.push_settings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_settings, public.push_subscriptions, public.push_deliveries from anon, authenticated;
grant all on public.push_settings, public.push_subscriptions, public.push_deliveries to service_role;

create function public.my_push_settings(p_endpoint text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.push_settings%rowtype;
begin
  select * into c from public.push_settings where id;
  if auth.uid() is null or auth.uid() is distinct from c.recipient_id then return jsonb_build_object('allowed',false); end if;
  return jsonb_build_object('allowed',true,'publicKey',c.public_key,'subscribed',exists(select 1 from public.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint));
end $$;

create function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists(select 1 from public.push_settings where id and recipient_id=auth.uid() and public_key is not null) then raise exception '푸시 등록 권한이 없습니다.'; end if;
  if p_endpoint is null or length(p_endpoint)>2048 or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^[:space:]]+$'
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then raise exception '올바르지 않은 푸시 구독입니다.'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),p_endpoint,p_p256dh,p_auth)
  on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth;
end $$;

create function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path=public as $$
  delete from public.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint;
$$;

create function public.dispatch_participant_push(p_initialize boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare c public.push_settings%rowtype;
begin
  if not p_initialize and not exists(select 1 from public.push_deliveries where sent_at is null and attempts<5 and next_attempt_at<=now() and created_at>now()-interval '1 day') then return; end if;
  select * into c from public.push_settings where id;
  perform net.http_post(url:=c.worker_url,headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',c.worker_secret),body:='{}'::jsonb,timeout_milliseconds:=10000);
exception when others then
  raise warning 'Push dispatch deferred; retry job will try again';
end $$;

create function public.test_my_push(p_endpoint text) returns void
language plpgsql security definer set search_path=public as $$
declare s public.push_subscriptions%rowtype;
begin
  if auth.uid() is null or not exists(select 1 from public.push_settings where id and recipient_id=auth.uid()) then raise exception '권한이 없습니다.'; end if;
  select * into s from public.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint for update;
  if not found then raise exception '먼저 알림을 켜 주세요.'; end if;
  if exists(select 1 from public.push_deliveries where subscription_id=s.id and notification_id is null and created_at>now()-interval '1 minute') then raise exception '잠시 후 다시 테스트해 주세요.'; end if;
  insert into public.push_deliveries(subscription_id,title,message,link) values(s.id,'보드라운지 알림 테스트','참가 알림을 이 휴대폰으로 받을 수 있습니다.','/notifications');
  perform public.dispatch_participant_push();
end $$;

create function public.claim_participant_push() returns jsonb
language sql security definer set search_path=public as $$
  with pending as (
    select id from public.push_deliveries where sent_at is null and attempts<5 and next_attempt_at<=now() and created_at>now()-interval '1 day'
    order by created_at for update skip locked limit 20
  ), claimed as (
    update public.push_deliveries d set attempts=d.attempts+1,next_attempt_at=now()+interval '3 minutes' from pending p where d.id=p.id returning d.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'message',c.message,'link',c.link,'subscriptionId',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]'::jsonb)
    from claimed c join public.push_subscriptions s on s.id=c.subscription_id join public.push_settings cfg on cfg.id and cfg.recipient_id=s.user_id;
$$;

create function public.enqueue_participant_push() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.type <> 'EVENT_JOINED' then return new; end if;
  insert into public.push_deliveries(subscription_id,notification_id,title,message,link)
    select s.id,new.id,new.title,new.message,coalesce(new.link,'/notifications') from public.push_subscriptions s
    join public.push_settings c on c.id and c.recipient_id=s.user_id where s.user_id=new.recipient_id
    on conflict(subscription_id,notification_id) do nothing;
  perform public.dispatch_participant_push();
  return new;
end $$;
create trigger enqueue_participant_push after insert on public.notifications for each row execute function public.enqueue_participant_push();

create function public.event_notification_label(p_started_at timestamptz,p_kind text) returns text
language sql stable set search_path=public as $$
  select to_char(p_started_at at time zone 'Asia/Seoul','FMMM/FMDD') || ' ' ||
    case p_kind when 'BOARDGAME' then '보겜' when 'MURDER_MYSTERY' then '머미' when 'CLOCKTOWER' then '시계탑' else '일반' end;
$$;

create or replace function public.notify_event_participation() returns trigger
language plpgsql security definer set search_path=public as $$
declare e record; member_name text; member_id uuid; recipient uuid; message text; kind text; heading text; dedupe text;
begin
  member_id:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  select * into e from public.events where id=case when tg_op='DELETE' then old.event_id else new.event_id end;
  if not found then if tg_op='DELETE' then return old; else return new; end if; end if;
  select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from public.profiles where id=member_id;
  kind:=case when tg_op='DELETE' then 'EVENT_LEFT' else 'EVENT_JOINED' end;
  heading:=case when tg_op='DELETE' then '참가 취소' else '새 참가자' end;
  message:=coalesce(member_name,'멤버')||'님이 '||public.event_notification_label(e.started_at,e.event_kind::text)||case when tg_op='DELETE' then ' 참가를 취소했습니다.' else '에 참가했습니다.' end;
  dedupe:='participant:'||e.id||':'||member_id||':'||lower(tg_op)||':'||gen_random_uuid();
  if e.created_by is not null and e.created_by<>member_id then
    perform public.create_member_notification(e.created_by,kind,heading,message,'/events/'||e.id,dedupe);
  end if;
  if tg_op='INSERT' then
    select recipient_id into recipient from public.push_settings where id;
    if recipient is not null and recipient<>member_id and recipient is distinct from e.created_by then
      perform public.create_member_notification(recipient,kind,heading,message,'/events/'||e.id,dedupe);
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

-- Update only the former generic wording; this does not queue old phone alerts.
update public.notifications n set message=replace(n.message,'님이 이벤트에 참가했습니다.','님이 '||public.event_notification_label(e.started_at,e.event_kind::text)||'에 참가했습니다.')
from public.events e where n.link='/events/'||e.id and n.type='EVENT_JOINED' and n.message like '%님이 이벤트에 참가했습니다.';

revoke all on function public.my_push_settings(text),public.save_push_subscription(text,text,text),public.remove_push_subscription(text),public.test_my_push(text) from public,anon;
grant execute on function public.my_push_settings(text),public.save_push_subscription(text,text,text),public.remove_push_subscription(text),public.test_my_push(text) to authenticated;
revoke all on function public.dispatch_participant_push(boolean),public.claim_participant_push(),public.enqueue_participant_push() from public,anon,authenticated;
-- Notification creation is internal to database business functions, never a client RPC.
revoke all on function public.create_member_notification(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_participant_push() to service_role;
select cron.schedule('participant-push-retry','* * * * *','select public.dispatch_participant_push();');
commit;
