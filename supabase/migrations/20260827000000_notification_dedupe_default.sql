-- Older event-management functions insert notifications without a dedupe key.
-- Give every such notification a unique fallback so the business operation is
-- not rolled back by the NOT NULL constraint.
alter table public.notifications
  alter column dedupe_key set default gen_random_uuid()::text;

