-- Restore Tuesday dates that were accidentally recorded as cancelled.
-- Keep the genuine 2026-08-25 NOT_HELD exception intact.

delete from public.event_recurrence_exceptions
where series_id = 'e405499a-505b-422c-8f98-a2e7fdf7932b'::uuid
  and reason = 'CANCELLED'
  and exception_date between date '2026-09-08' and date '2026-10-20';

select public.generate_recurring_events(
  'e405499a-505b-422c-8f98-a2e7fdf7932b'::uuid
);

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
