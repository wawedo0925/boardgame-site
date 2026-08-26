create table if not exists public.murder_mystery_interests (
  murder_mystery_id uuid not null references public.murder_mysteries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (murder_mystery_id, user_id)
);

create index if not exists murder_mystery_interests_created_idx on public.murder_mystery_interests(murder_mystery_id, created_at);
alter table public.murder_mystery_interests enable row level security;

drop policy if exists "members read murder interests" on public.murder_mystery_interests;
create policy "members read murder interests" on public.murder_mystery_interests for select to authenticated using (true);
drop policy if exists "members create own murder interests" on public.murder_mystery_interests;
create policy "members create own murder interests" on public.murder_mystery_interests for insert to authenticated
with check (
  auth.uid() = user_id
  and not exists (
    select 1 from public.murder_mystery_personal_records record
    where record.user_id = auth.uid() and record.murder_mystery_id = murder_mystery_interests.murder_mystery_id
  )
  and not exists (
    select 1 from public.murder_mystery_history history
    where history.user_id = auth.uid() and history.murder_mystery_id = murder_mystery_interests.murder_mystery_id
  )
);
drop policy if exists "members delete own murder interests" on public.murder_mystery_interests;
create policy "members delete own murder interests" on public.murder_mystery_interests for delete to authenticated using (auth.uid() = user_id);

create or replace function public.remove_completed_murder_interest()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.murder_mystery_id is not null then
    delete from public.murder_mystery_interests
    where user_id = new.user_id and murder_mystery_id = new.murder_mystery_id;
  end if;
  return new;
end;
$$;

drop trigger if exists remove_completed_murder_interest_trigger on public.murder_mystery_personal_records;
create trigger remove_completed_murder_interest_trigger after insert or update of murder_mystery_id on public.murder_mystery_personal_records
for each row execute function public.remove_completed_murder_interest();

delete from public.murder_mystery_interests interest
where exists (
  select 1 from public.murder_mystery_personal_records record
  where record.user_id = interest.user_id and record.murder_mystery_id = interest.murder_mystery_id
)
or exists (
  select 1 from public.murder_mystery_history history
  where history.user_id = interest.user_id and history.murder_mystery_id = interest.murder_mystery_id
);
