create table if not exists public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists event_comments_event_created_idx
  on public.event_comments(event_id, created_at);

alter table public.event_comments enable row level security;

drop policy if exists "event comments readable" on public.event_comments;
create policy "event comments readable"
  on public.event_comments
  for select
  to authenticated
  using (true);

drop policy if exists "members create own event comments" on public.event_comments;
create policy "members create own event comments"
  on public.event_comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "members delete own event comments" on public.event_comments;
create policy "members delete own event comments"
  on public.event_comments
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.can_operate_event(event_id)
  );
