begin;

create table public.event_first_joins (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null,
  primary key (event_id, user_id)
);
alter table public.event_first_joins enable row level security;
revoke all on public.event_first_joins from anon, authenticated;
create function public.remember_event_first_join() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.event_first_joins(event_id,user_id,joined_at) values(new.event_id,new.user_id,new.joined_at)
  on conflict(event_id,user_id) do update set joined_at=least(event_first_joins.joined_at,excluded.joined_at);
  return new;
end $$;
revoke all on function public.remember_event_first_join() from public,anon,authenticated;
create trigger remember_event_first_join after insert on public.event_participants for each row execute function public.remember_event_first_join();
create trigger remember_event_first_join after insert on public.event_waitlist for each row execute function public.remember_event_first_join();
insert into public.event_first_joins
select event_id, user_id, min(joined_at) from (
  select event_id, user_id, joined_at from public.event_participants
  union all select event_id, user_id, joined_at from public.event_waitlist
) j group by event_id, user_id
on conflict(event_id,user_id) do update set joined_at=least(event_first_joins.joined_at,excluded.joined_at);

create table public.refund_account_presets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bank text not null check(length(bank) between 1 and 50),
  account_number text not null check(account_number ~ '^[0-9 -]{5,40}$'),
  updated_at timestamptz not null default now()
);
alter table public.refund_account_presets enable row level security;
revoke all on public.refund_account_presets from anon,authenticated;
grant select on public.refund_account_presets to authenticated;
create policy own_refund_preset on public.refund_account_presets for select to authenticated using(user_id=auth.uid());

create table public.event_refund_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_name text not null,
  event_title text not null,
  method text not null check(method in ('KAKAOPAY','BANK')),
  bank text,
  account_number text,
  first_joined_at timestamptz not null,
  requested_at timestamptz not null default now(),
  check ((method='KAKAOPAY' and bank is null and account_number is null) or
         (method='BANK' and bank is not null and length(bank) between 1 and 50 and account_number is not null and account_number ~ '^[0-9 -]{5,40}$'))
);
alter table public.event_refund_requests enable row level security;
revoke all on public.event_refund_requests from anon,authenticated;
grant select on public.event_refund_requests to authenticated;
create policy private_refund_request on public.event_refund_requests for select to authenticated using(user_id=auth.uid() or public.is_main_admin());
create index event_refund_requests_user_idx on public.event_refund_requests(user_id,requested_at desc);

create function public.leave_event_with_refund(p_event_id uuid,p_method text,p_bank text default null,p_account_number text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  u uuid:=auth.uid(); e public.events%rowtype; joined timestamptz; request_id uuid;
  member_name text; recipient uuid; result text;
begin
  if u is null then raise exception '로그인이 필요합니다.'; end if;
  if p_method is null or p_method not in ('NONE','KAKAOPAY','BANK') then raise exception '환불 방법을 선택해 주세요.'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception '이벤트를 찾을 수 없습니다.'; end if;
  if e.created_by=u then raise exception '이벤트 생성자는 참가를 취소할 수 없습니다.'; end if;
  select joined_at into joined from public.event_first_joins where event_id=p_event_id and user_id=u;
  if not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=u)
    and not exists(select 1 from public.event_waitlist where event_id=p_event_id and user_id=u) then
    raise exception '이미 참가 취소되었거나 참가 내역이 없습니다.';
  end if;
  if p_method='BANK' then
    p_bank:=trim(p_bank); p_account_number:=trim(p_account_number);
    if p_bank is null or length(p_bank) not between 1 and 50 or p_account_number is null
       or p_account_number !~ '^[0-9 -]{5,40}$' or p_account_number !~ '[0-9]{3}' then
      raise exception '은행과 올바른 계좌번호를 입력해 주세요.';
    end if;
  end if;
  if p_method<>'NONE' then
    if joined is null then raise exception '참가 신청 시간을 확인할 수 없습니다.'; end if;
    select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from public.profiles where id=u;
    insert into public.event_refund_requests(event_id,user_id,activity_name,event_title,method,bank,account_number,first_joined_at)
    values(p_event_id,u,coalesce(member_name,'멤버'),e.title,p_method,
      case when p_method='BANK' then p_bank end,case when p_method='BANK' then p_account_number end,joined)
    returning id into request_id;
    if p_method='BANK' then
      insert into public.refund_account_presets(user_id,bank,account_number) values(u,p_bank,p_account_number)
      on conflict(user_id) do update set bank=excluded.bank,account_number=excluded.account_number,updated_at=now();
    end if;
  end if;
  result:=public.cancel_event_join_or_waitlist(p_event_id);
  if result not in ('CANCELLED','WAITLIST_CANCELLED') then raise exception '참가 취소에 실패했습니다.'; end if;
  if request_id is not null then
    for recipient in select user_id from public.site_roles where role='MAIN_ADMIN' loop
      perform public.create_member_notification(recipient,'EVENT_REFUND','환불 요청',
        coalesce(member_name,'멤버')||'님이 '||e.title||' 환불을 요청했습니다. 수령 방법을 확인해 주세요.',
        '/refunds/'||request_id,'refund:'||request_id);
    end loop;
    if not public.is_main_admin() then
      perform public.create_member_notification(u,'EVENT_REFUND','환불 요청 접수',
        e.title||' 참가가 취소되고 환불 요청이 접수되었습니다. 실제 환불은 관리자 확인 후 진행됩니다.',
        '/refunds/'||request_id,'refund:'||request_id);
    end if;
  end if;
  return request_id;
end $$;
revoke all on function public.leave_event_with_refund(uuid,text,text,text) from public,anon;
grant execute on function public.leave_event_with_refund(uuid,text,text,text) to authenticated;

create or replace function public.enqueue_participant_push() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.type not in ('EVENT_JOINED','EVENT_REFUND') then return new; end if;
  insert into public.push_deliveries(subscription_id,notification_id,title,message,link)
    select s.id,new.id,new.title,new.message,coalesce(new.link,'/notifications') from public.push_subscriptions s
    join public.push_settings c on c.id and c.recipient_id=s.user_id where s.user_id=new.recipient_id
    on conflict(subscription_id,notification_id) do nothing;
  perform public.dispatch_participant_push();
  return new;
end $$;
commit;
