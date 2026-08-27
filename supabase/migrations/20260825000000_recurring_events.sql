-- Recurring event series, rolling two-month generation, cancellation exceptions,
-- and atomic cancellation cleanup. Apply with Supabase migrations before deploying.

create extension if not exists pgcrypto;

create table if not exists public.event_recurrence_series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_time time not null,
  end_time time,
  first_date date not null,
  interval_weeks smallint not null check (interval_weeks in (1, 2)),
  location text,
  description text,
  max_participants integer check (max_participants is null or max_participants > 0),
  event_kind text not null,
  murder_mystery_id uuid,
  created_by uuid not null,
  creator_role text not null default 'PLAYER' check (creator_role in ('PLAYER', 'GM')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_recurrence_exceptions (
  series_id uuid not null references public.event_recurrence_series(id) on delete cascade,
  exception_date date not null,
  reason text not null default 'CANCELLED',
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (series_id, exception_date)
);

alter table public.events add column if not exists recurrence_series_id uuid references public.event_recurrence_series(id) on delete set null;
alter table public.events add column if not exists recurrence_date date;
alter table public.events add column if not exists volume_number integer check (volume_number is null or volume_number > 0);
alter table public.events add column if not exists recurrence_base_title text;
create unique index if not exists events_recurrence_occurrence_uidx on public.events(recurrence_series_id, recurrence_date) where recurrence_series_id is not null;
create index if not exists events_recurrence_volume_idx on public.events(recurrence_series_id, volume_number) where recurrence_series_id is not null;

alter table public.event_recurrence_series enable row level security;
alter table public.event_recurrence_exceptions enable row level security;
drop policy if exists "recurrence series readable" on public.event_recurrence_series;
create policy "recurrence series readable" on public.event_recurrence_series for select to authenticated using (true);
drop policy if exists "recurrence exceptions readable" on public.event_recurrence_exceptions;
create policy "recurrence exceptions readable" on public.event_recurrence_exceptions for select to authenticated using (true);

create or replace function public.generate_recurring_events(p_series_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.event_recurrence_series%rowtype;
  occurrence_date date;
  horizon date;
  next_volume integer;
  new_event_id uuid;
  inserted_count integer := 0;
begin
  for s in select * from public.event_recurrence_series where is_active and (p_series_id is null or id = p_series_id)
  loop
    horizon := greatest((current_date + interval '2 months')::date, (s.first_date + interval '2 months')::date);
    select coalesce(max(volume_number), 0) + 1 into next_volume from public.events where recurrence_series_id = s.id;
    occurrence_date := greatest(s.first_date, current_date);
    while occurrence_date <= horizon loop
      if mod(occurrence_date - s.first_date, s.interval_weeks * 7) = 0
         and not exists (select 1 from public.event_recurrence_exceptions x where x.series_id = s.id and x.exception_date = occurrence_date)
         and not exists (select 1 from public.events e where e.recurrence_series_id = s.id and e.recurrence_date = occurrence_date) then
        insert into public.events(title, started_at, ended_at, location, description, created_by, max_participants, event_kind, murder_mystery_id, recurrence_series_id, recurrence_date, volume_number, recurrence_base_title)
        values (
          s.title || ' Vol.' || next_volume,
          (occurrence_date + s.start_time) at time zone 'Asia/Seoul',
          case when s.end_time is null then null else (occurrence_date + s.end_time) at time zone 'Asia/Seoul' end,
          s.location, s.description, s.created_by, s.max_participants, s.event_kind, s.murder_mystery_id,
          s.id, occurrence_date, next_volume, s.title
        ) returning id into new_event_id;
        insert into public.event_participants(event_id, user_id, participation_role)
        values (new_event_id, s.created_by, s.creator_role) on conflict do nothing;
        if s.event_kind = 'MURDER_MYSTERY' and s.creator_role = 'GM' then
          insert into public.event_staff(event_id, user_id, duty, assigned_by)
          values (new_event_id, s.created_by, 'GM', s.created_by) on conflict do nothing;
        end if;
        next_volume := next_volume + 1;
        inserted_count := inserted_count + 1;
      end if;
      occurrence_date := occurrence_date + 1;
    end loop;
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.create_recurring_event_series(
  p_title text, p_started_at timestamptz, p_ended_at timestamptz, p_location text,
  p_description text, p_max_participants integer, p_event_kind text,
  p_murder_mystery_id uuid, p_interval_weeks integer, p_creator_role text default 'PLAYER'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  series_id uuid;
  first_event_id uuid;
  actor uuid := auth.uid();
  local_start timestamp := p_started_at at time zone 'Asia/Seoul';
  local_end timestamp := case when p_ended_at is null then null else p_ended_at at time zone 'Asia/Seoul' end;
begin
  if actor is null then raise exception '로그인이 필요합니다.'; end if;
  if p_interval_weeks not in (1, 2) then raise exception '반복 주기는 1주 또는 2주여야 합니다.'; end if;
  if p_started_at <= now() then raise exception '시작 전 일정만 만들 수 있습니다.'; end if;
  if p_creator_role = 'GM' and public.current_site_role() not in ('MAIN_ADMIN', 'ADMIN', 'RULE_MASTER') then
    raise exception 'GM 반복 일정은 관리자 또는 룰마만 만들 수 있습니다.';
  end if;
  insert into public.event_recurrence_series(title, start_time, end_time, first_date, interval_weeks, location, description, max_participants, event_kind, murder_mystery_id, created_by, creator_role)
  values (trim(p_title), local_start::time, local_end::time, local_start::date, p_interval_weeks, p_location, p_description, p_max_participants, p_event_kind, p_murder_mystery_id, actor, p_creator_role)
  returning id into series_id;
  perform public.generate_recurring_events(series_id);
  select id into first_event_id from public.events where recurrence_series_id = series_id order by recurrence_date limit 1;
  return first_event_id;
end;
$$;

create or replace function public.set_event_cancelled(p_event_id uuid, p_cancelled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.events%rowtype;
  actor uuid := auth.uid();
begin
  select * into target from public.events where id = p_event_id for update;
  if not found then raise exception '이벤트를 찾을 수 없습니다.'; end if;
  if not p_cancelled then raise exception '취소한 이벤트는 다시 열 수 없습니다.'; end if;
  if target.started_at <= now() then raise exception '이미 시작했거나 종료된 이벤트는 취소할 수 없습니다.'; end if;
  if public.current_site_role() not in ('MAIN_ADMIN', 'ADMIN')
     and not (public.current_site_role() = 'RULE_MASTER' and target.created_by = actor) then
    raise exception '이벤트 취소 권한이 없습니다.';
  end if;

  insert into public.notifications(recipient_id, type, title, message, link, dedupe_key)
  select user_id, 'EVENT_CANCELLED', '이벤트 취소', target.title || ' 일정이 취소되었습니다.', '/events/' || target.id,
         'event-cancelled:' || target.id || ':' || user_id || ':' || gen_random_uuid()
  from (
    select user_id from public.event_participants where event_id = target.id
    union
    select user_id from public.event_waitlist where event_id = target.id
  ) recipients;

  if target.recurrence_series_id is not null then
    insert into public.event_recurrence_exceptions(series_id, exception_date, created_by)
    values (target.recurrence_series_id, target.recurrence_date, actor)
    on conflict (series_id, exception_date) do nothing;
  end if;

  delete from public.event_round_players where round_id in (
    select r.id from public.event_game_rounds r join public.event_game_sessions s on s.id = r.session_id where s.event_id = target.id
  );
  delete from public.event_game_rounds where session_id in (select id from public.event_game_sessions where event_id = target.id);
  delete from public.event_group_members where group_id in (select id from public.event_groups where event_id = target.id);
  delete from public.event_groups where event_id = target.id;
  delete from public.event_game_sessions where event_id = target.id;
  delete from public.event_staff where event_id = target.id;
  delete from public.event_waitlist where event_id = target.id;
  delete from public.event_participants where event_id = target.id;
  update public.events set event_status = 'CANCELLED', closed_at = now() where id = target.id;

  if target.recurrence_series_id is not null then
    update public.events
    set volume_number = volume_number - 1,
        title = coalesce(recurrence_base_title, target.recurrence_base_title) || ' Vol.' || (volume_number - 1)
    where recurrence_series_id = target.recurrence_series_id
      and recurrence_date > target.recurrence_date
      and event_status <> 'CANCELLED';
    update public.events set volume_number = null where id = target.id;
  end if;
end;
$$;

create or replace function public.hard_delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.events%rowtype;
begin
  select * into target from public.events where id = p_event_id for update;
  if not found then raise exception '이벤트를 찾을 수 없습니다.'; end if;
  if target.started_at <= now() then raise exception '이미 시작했거나 종료된 이벤트는 삭제할 수 없습니다.'; end if;
  if not public.is_main_admin() then raise exception '메인 관리자만 이벤트를 삭제할 수 있습니다.'; end if;

  if target.recurrence_series_id is not null then
    insert into public.event_recurrence_exceptions(series_id, exception_date, created_by)
    values (target.recurrence_series_id, target.recurrence_date, auth.uid())
    on conflict (series_id, exception_date) do nothing;
  end if;

  delete from public.event_round_players where round_id in (
    select r.id from public.event_game_rounds r join public.event_game_sessions s on s.id = r.session_id where s.event_id = target.id
  );
  delete from public.event_game_rounds where session_id in (select id from public.event_game_sessions where event_id = target.id);
  delete from public.event_group_members where group_id in (select id from public.event_groups where event_id = target.id);
  delete from public.event_groups where event_id = target.id;
  delete from public.event_game_sessions where event_id = target.id;
  delete from public.event_staff where event_id = target.id;
  delete from public.event_waitlist where event_id = target.id;
  delete from public.event_participants where event_id = target.id;
  delete from public.events where id = target.id;

  if target.recurrence_series_id is not null then
    update public.events
    set volume_number = volume_number - 1,
        title = coalesce(recurrence_base_title, target.recurrence_base_title) || ' Vol.' || (volume_number - 1)
    where recurrence_series_id = target.recurrence_series_id
      and recurrence_date > target.recurrence_date
      and event_status <> 'CANCELLED';
  end if;
end;
$$;

revoke all on function public.generate_recurring_events(uuid) from public, anon, authenticated;
grant execute on function public.create_recurring_event_series(text,timestamptz,timestamptz,text,text,integer,text,uuid,integer,text) to authenticated;
grant execute on function public.set_event_cancelled(uuid,boolean) to authenticated;
revoke all on function public.hard_delete_event(uuid) from public, anon;
grant execute on function public.hard_delete_event(uuid) to authenticated;

-- Supabase에서 pg_cron을 사용할 수 있으면 매일 자정(한국 시간 오전 9시)에 2개월 범위를 보충한다.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'generate-recurring-events-two-months') then
      perform cron.schedule('generate-recurring-events-two-months', '0 0 * * *', 'select public.generate_recurring_events();');
    end if;
  end if;
end $$;
