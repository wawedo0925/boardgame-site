begin;
create table public.personal_game_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('FAVORITE','GM')),
  game_id uuid references public.games(id) on delete cascade,
  custom_name text,
  memo text not null default '',
  rules text not null default '',
  tips text not null default '',
  updated_at timestamptz not null default now(),
  unique(user_id, kind, game_id),
  check (game_id is not null or (kind = 'GM' and coalesce(length(trim(custom_name)), 0) > 0))
);
alter table public.personal_game_notes enable row level security;
grant select, insert, update, delete on public.personal_game_notes to authenticated;
create policy own_game_notes on public.personal_game_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
commit;
