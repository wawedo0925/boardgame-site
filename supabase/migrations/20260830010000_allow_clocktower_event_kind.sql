-- Allow 시계탑에 흐른 피 events in the existing event-kind constraint.

alter table public.events
  drop constraint if exists events_event_kind_check;

alter table public.events
  add constraint events_event_kind_check
  check (event_kind in ('GENERAL', 'BOARDGAME', 'MURDER_MYSTERY', 'CLOCKTOWER'));
