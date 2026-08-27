-- Repair the Tuesday recurring series and keep a rolling two-month window filled.
-- Existing cancellation exceptions remain respected.

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
  generated_volume integer;
  new_event_id uuid;
  inserted_count integer := 0;
begin
  for s in
    select *
    from public.event_recurrence_series
    where is_active
      and (p_series_id is null or id = p_series_id)
  loop
    horizon := (current_date + interval '2 months')::date;
    occurrence_date := greatest(s.first_date, current_date);

    while occurrence_date <= horizon loop
      if mod(occurrence_date - s.first_date, s.interval_weeks * 7) = 0
         and not exists (
           select 1
           from public.event_recurrence_exceptions x
           where x.series_id = s.id
             and x.exception_date = occurrence_date
         )
         and not exists (
           select 1
           from public.events e
           where e.recurrence_series_id = s.id
             and e.recurrence_date = occurrence_date
         ) then
        generated_volume := s.volume_seed
          + ((occurrence_date - s.first_date) / (s.interval_weeks * 7));

        insert into public.events(
          title, started_at, ended_at, location, description, created_by,
          max_participants, event_kind, murder_mystery_id,
          recurrence_series_id, recurrence_date, volume_number,
          recurrence_base_title, participation_fee
        )
        values (
          s.title || ' Vol.' || generated_volume,
          (occurrence_date + s.start_time) at time zone 'Asia/Seoul',
          case
            when s.end_time is null then null
            else (occurrence_date + s.end_time) at time zone 'Asia/Seoul'
          end,
          s.location, s.description, s.created_by, s.max_participants,
          s.event_kind, s.murder_mystery_id, s.id, occurrence_date,
          generated_volume, s.title, s.participation_fee
        )
        returning id into new_event_id;

        insert into public.event_participants(event_id, user_id, participation_role)
        values (new_event_id, s.created_by, s.creator_role)
        on conflict do nothing;

        if s.event_kind = 'MURDER_MYSTERY' and s.creator_role = 'GM' then
          insert into public.event_staff(event_id, user_id, duty, assigned_by)
          values (new_event_id, s.created_by, 'GM', s.created_by)
          on conflict do nothing;
        end if;

        inserted_count := inserted_count + 1;
      end if;

      occurrence_date := occurrence_date + 1;
    end loop;
  end loop;

  return inserted_count;
end;
$$;

do $$
declare
  tuesday_series uuid;
begin
  select e.recurrence_series_id
  into tuesday_series
  from public.events e
  where e.recurrence_date = date '2026-09-01'
    and e.event_kind = 'BOARDGAME'
    and e.recurrence_series_id is not null
    and (
      e.recurrence_base_title = '[화/정기] 보드게임'
      or e.title like '[화/정기] 보드게임%'
    )
  order by e.created_at
  limit 1;

  if tuesday_series is null then
    raise exception '2026-09-01 화요일 반복 이벤트 시리즈를 찾지 못했습니다.';
  end if;

  update public.event_recurrence_series
  set title = '[화/정기] 보드게임',
      start_time = time '19:20',
      end_time = time '22:20',
      first_date = date '2026-08-25',
      interval_weeks = 1,
      volume_seed = 31,
      is_active = true,
      updated_at = now()
  where id = tuesday_series;

  perform public.generate_recurring_events(tuesday_series);
end;
$$;

-- Recreate the daily refill job when pg_cron is available.
-- 15:05 UTC is 00:05 in Korea.
do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job_id in
      select jobid
      from cron.job
      where jobname = 'generate-recurring-events-two-months'
    loop
      perform cron.unschedule(existing_job_id);
    end loop;

    perform cron.schedule(
      'generate-recurring-events-two-months',
      '5 15 * * *',
      'select public.generate_recurring_events();'
    );
  end if;
end;
$$;

revoke all on function public.generate_recurring_events(uuid)
from public, anon, authenticated;

-- Verification output: every Tuesday from September 1 through the rolling horizon.
select
  title,
  recurrence_date,
  volume_number,
  started_at at time zone 'Asia/Seoul' as korea_start
from public.events
where recurrence_date >= date '2026-09-01'
  and recurrence_date <= (current_date + interval '2 months')::date
  and recurrence_base_title = '[화/정기] 보드게임'
  and event_status <> 'CANCELLED'
order by recurrence_date;
