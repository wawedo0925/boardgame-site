-- Initialize the real-world Vol anchors for Tuesday, Thursday, and Sunday.
-- Run after 20260826020000_recurring_event_volume_anchors.sql.

do $$
declare
  tuesday_series uuid := 'e405499a-505b-422c-8f98-a2e7fdf7932b';
  thursday_source uuid := '1b398eb7-109a-4b17-a0a6-f659bf4c4b48';
  sunday_source uuid := 'b63c5555-c2d9-4b49-b441-055386254f8a';
  thursday_series uuid;
  sunday_series uuid;
begin
  -- Remove only future occurrences generated from the temporary Tuesday test.
  delete from public.event_staff
  where event_id in (
    select id from public.events
    where recurrence_series_id = tuesday_series and started_at > now()
  );
  delete from public.event_waitlist
  where event_id in (
    select id from public.events
    where recurrence_series_id = tuesday_series and started_at > now()
  );
  delete from public.event_participants
  where event_id in (
    select id from public.events
    where recurrence_series_id = tuesday_series and started_at > now()
  );
  delete from public.events
  where recurrence_series_id = tuesday_series and started_at > now();

  -- Turn the August 25 test series into the real weekly Tuesday schedule.
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

  update public.events
  set title = '[화/정기] 보드게임 Vol.31',
      recurrence_base_title = '[화/정기] 보드게임',
      recurrence_date = date '2026-08-25',
      volume_number = 31
  where recurrence_series_id = tuesday_series
    and recurrence_date = date '2026-08-25';

  -- Create the Thursday series from the existing August 20 event template.
  select id into thursday_series
  from public.event_recurrence_series
  where title = '[목/정기] 보드게임'
    and first_date = date '2026-08-27'
  limit 1;

  if thursday_series is null then
    insert into public.event_recurrence_series(
      title, start_time, end_time, first_date, interval_weeks,
      location, description, max_participants, event_kind,
      murder_mystery_id, created_by, creator_role,
      participation_fee, volume_seed
    )
    select
      '[목/정기] 보드게임',
      (started_at at time zone 'Asia/Seoul')::time,
      case when ended_at is null then null else (ended_at at time zone 'Asia/Seoul')::time end,
      date '2026-08-27', 1,
      location, description, max_participants, 'BOARDGAME',
      null, created_by, 'PLAYER', participation_fee, 27
    from public.events
    where id = thursday_source
    returning id into thursday_series;
  end if;

  -- Create the Sunday series from the existing August 23 event template.
  select id into sunday_series
  from public.event_recurrence_series
  where title = '[일/정기] 보드게임'
    and first_date = date '2026-08-30'
  limit 1;

  if sunday_series is null then
    insert into public.event_recurrence_series(
      title, start_time, end_time, first_date, interval_weeks,
      location, description, max_participants, event_kind,
      murder_mystery_id, created_by, creator_role,
      participation_fee, volume_seed
    )
    select
      '[일/정기] 보드게임',
      (started_at at time zone 'Asia/Seoul')::time,
      case when ended_at is null then null else (ended_at at time zone 'Asia/Seoul')::time end,
      date '2026-08-30', 1,
      location, description, max_participants, 'BOARDGAME',
      null, created_by, 'PLAYER', participation_fee, 32
    from public.events
    where id = sunday_source
    returning id into sunday_series;
  end if;

  if not exists (select 1 from public.event_recurrence_series where id = tuesday_series) then
    raise exception '화요일 테스트 반복 시리즈를 찾지 못했습니다.';
  end if;
  if thursday_series is null then
    raise exception '목요일 기준 이벤트를 찾지 못했습니다.';
  end if;
  if sunday_series is null then
    raise exception '일요일 기준 이벤트를 찾지 못했습니다.';
  end if;

  perform public.generate_recurring_events(tuesday_series);
  perform public.generate_recurring_events(thursday_series);
  perform public.generate_recurring_events(sunday_series);
end $$;

select
  title,
  recurrence_date,
  volume_number,
  started_at at time zone 'Asia/Seoul' as korea_start
from public.events
where recurrence_date in (
  date '2026-08-27',
  date '2026-08-30',
  date '2026-09-01'
)
order by recurrence_date;
