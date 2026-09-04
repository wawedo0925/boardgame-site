-- Restore the existing Tuesday series and immediately fill its rolling window.
-- This keeps the real-world Vol.32 anchor on 2026-09-01.

do $$
declare
  tuesday_series constant uuid := 'e405499a-505b-422c-8f98-a2e7fdf7932b';
begin
  if not exists (
    select 1
    from public.event_recurrence_series
    where id = tuesday_series
  ) then
    raise exception '화요일 반복 일정 시리즈를 찾지 못했습니다.';
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

select
  title,
  recurrence_date,
  volume_number,
  started_at at time zone 'Asia/Seoul' as korea_start,
  event_status
from public.events
where recurrence_series_id = 'e405499a-505b-422c-8f98-a2e7fdf7932b'::uuid
  and recurrence_date >= date '2026-09-01'
order by recurrence_date;
