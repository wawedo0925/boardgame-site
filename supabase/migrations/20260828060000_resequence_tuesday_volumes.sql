-- Recalculate every Tuesday volume from the real Vol.31 anchor on 2026-08-25.

update public.events
set volume_number = 31 + ((recurrence_date - date '2026-08-25') / 7),
    title = '[화/정기] 보드게임 Vol.' ||
      (31 + ((recurrence_date - date '2026-08-25') / 7)),
    recurrence_base_title = '[화/정기] 보드게임'
where recurrence_series_id = 'e405499a-505b-422c-8f98-a2e7fdf7932b'::uuid
  and recurrence_date is not null;

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
