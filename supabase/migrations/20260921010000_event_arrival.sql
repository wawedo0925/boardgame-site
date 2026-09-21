begin;
create table public.event_arrival_plans (
 event_id uuid not null references public.events(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 arrival_at timestamptz,
 arrival_mode text not null check(arrival_mode in ('NORMAL','CLOCKTOWER_EXPERIENCED','CLOCKTOWER_NEW')),
 primary key(event_id,user_id)
);
alter table public.event_arrival_plans enable row level security;
revoke all on public.event_arrival_plans from public,anon,authenticated;
grant select on public.event_arrival_plans to authenticated;
create policy read_event_arrivals on public.event_arrival_plans for select to authenticated using (
 exists(select 1 from public.event_participants p where p.event_id=event_arrival_plans.event_id and p.user_id=event_arrival_plans.user_id)
 or exists(select 1 from public.event_waitlist w where w.event_id=event_arrival_plans.event_id and w.user_id=event_arrival_plans.user_id)
);
create function public.join_event_with_arrival(p_event_id uuid,p_arrival_at timestamptz default null,p_arrival_mode text default 'NORMAL') returns text
language plpgsql security definer set search_path=public as $$
declare e public.events%rowtype; u uuid:=auth.uid(); result text; latest timestamptz;
begin
 if u is null then raise exception '로그인이 필요합니다.'; end if;
 select * into e from public.events where id=p_event_id for update;
 if not found then raise exception '이벤트를 찾을 수 없습니다.'; end if;
 if p_arrival_mode is null or p_arrival_mode not in ('NORMAL','CLOCKTOWER_EXPERIENCED','CLOCKTOWER_NEW') then raise exception '참가 방식을 확인해 주세요.'; end if;
 if e.event_kind<>'CLOCKTOWER' and p_arrival_mode<>'NORMAL' then raise exception '참가 방식을 확인해 주세요.'; end if;
 if p_arrival_at is not null then
   latest:=e.ended_at;
   if e.event_kind='MURDER_MYSTERY' then latest:=least(latest,e.started_at+interval '10 minutes');
   elsif e.event_kind='CLOCKTOWER' and p_arrival_mode='CLOCKTOWER_NEW' then latest:=least(latest,e.started_at+interval '5 minutes');
   elsif e.event_kind='CLOCKTOWER' and p_arrival_mode<>'CLOCKTOWER_EXPERIENCED' then raise exception '룰 숙지 여부를 선택해 주세요.';
   end if;
   if latest is null then raise exception '종료 시간이 설정되어야 늦참을 신청할 수 있습니다.'; end if;
   if not isfinite(p_arrival_at) or p_arrival_at<e.started_at or p_arrival_at>latest then raise exception '허용된 참가 시간 안에서 선택해 주세요.'; end if;
 end if;
 result:=public.join_event_with_capacity(p_event_id);
 if not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=u)
 and not exists(select 1 from public.event_waitlist where event_id=p_event_id and user_id=u) then raise exception '참가 신청을 확인할 수 없습니다.'; end if;
 insert into public.event_arrival_plans(event_id,user_id,arrival_at,arrival_mode)
 values(p_event_id,u,p_arrival_at,p_arrival_mode)
 on conflict(event_id,user_id) do update set arrival_at=excluded.arrival_at,arrival_mode=excluded.arrival_mode;
 return result;
end;
$$;
revoke all on function public.join_event_with_arrival(uuid,timestamptz,text) from public,anon;
grant execute on function public.join_event_with_arrival(uuid,timestamptz,text) to authenticated;
commit;
