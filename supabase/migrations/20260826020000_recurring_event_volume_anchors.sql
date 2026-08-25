-- Preserve independent Vol numbering for each recurring event series.
-- Anchors requested for the existing Thursday, Sunday, and Tuesday schedules.

alter table public.event_recurrence_series
  add column if not exists volume_seed integer not null default 1
  check (volume_seed > 0);

create or replace function public.set_recurring_event_volume_anchor(
  p_anchor_date date,
  p_anchor_volume integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  updated_series integer := 0;
  calculated_seed integer;
begin
  if p_anchor_volume < 1 then
    raise exception 'Vol 번호는 1 이상이어야 합니다.';
  end if;

  for target in
    select distinct s.id, s.first_date, s.interval_weeks
    from public.event_recurrence_series s
    join public.events e on e.recurrence_series_id = s.id
    where e.recurrence_date = p_anchor_date
      and e.event_kind = 'BOARDGAME'
  loop
    calculated_seed := p_anchor_volume
      - ((p_anchor_date - target.first_date) / (target.interval_weeks * 7));

    if calculated_seed < 1 then
      raise exception '계산된 시작 Vol 번호가 1보다 작습니다.';
    end if;

    update public.event_recurrence_series
    set volume_seed = calculated_seed,
        updated_at = now()
    where id = target.id;

    update public.events e
    set volume_number = calculated_seed
          + ((e.recurrence_date - target.first_date) / (target.interval_weeks * 7)),
        title = coalesce(
          e.recurrence_base_title,
          regexp_replace(e.title, '\s+Vol\.[0-9]+$', '')
        ) || ' Vol.' || (
          calculated_seed
          + ((e.recurrence_date - target.first_date) / (target.interval_weeks * 7))
        )
    where e.recurrence_series_id = target.id
      and e.event_status <> 'CANCELLED';

    updated_series := updated_series + 1;
  end loop;

  return updated_series;
end;
$$;

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
    select coalesce(max(volume_number) + 1, s.volume_seed)
    into next_volume
    from public.events
    where recurrence_series_id = s.id;

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

-- Apply the requested anchors to matching recurring board-game series.
select public.set_recurring_event_volume_anchor(date '2026-08-27', 27);
select public.set_recurring_event_volume_anchor(date '2026-08-30', 32);
select public.set_recurring_event_volume_anchor(date '2026-09-01', 32);

revoke all on function public.set_recurring_event_volume_anchor(date, integer)
from public, anon, authenticated;
revoke all on function public.generate_recurring_events(uuid)
from public, anon, authenticated;
