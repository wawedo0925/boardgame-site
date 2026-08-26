create table if not exists public.murder_mystery_personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  murder_mystery_id uuid references public.murder_mysteries(id) on delete set null,
  custom_title text,
  participation_role text not null default 'PLAYER' check (participation_role in ('PLAYER', 'GM')),
  rating smallint check (rating is null or rating between 1 and 10),
  private_memo text check (private_memo is null or char_length(private_memo) <= 150),
  played_at date not null default current_date,
  source text not null default 'MANUAL' check (source in ('MANUAL', 'EVENT', 'LEGACY')),
  event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (murder_mystery_id is not null or nullif(btrim(custom_title), '') is not null)
);

create unique index if not exists murder_personal_event_user_uidx on public.murder_mystery_personal_records(event_id, user_id) where event_id is not null;
create index if not exists murder_personal_user_played_idx on public.murder_mystery_personal_records(user_id, played_at desc);
alter table public.murder_mystery_personal_records enable row level security;

drop policy if exists "members read own murder records" on public.murder_mystery_personal_records;
create policy "members read own murder records" on public.murder_mystery_personal_records for select to authenticated using (auth.uid() = user_id);
drop policy if exists "members create own murder records" on public.murder_mystery_personal_records;
create policy "members create own murder records" on public.murder_mystery_personal_records for insert to authenticated with check (auth.uid() = user_id and source = 'MANUAL' and event_id is null);
drop policy if exists "members update own murder records" on public.murder_mystery_personal_records;
create policy "members update own murder records" on public.murder_mystery_personal_records for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "members delete own manual murder records" on public.murder_mystery_personal_records;
create policy "members delete own manual murder records" on public.murder_mystery_personal_records for delete to authenticated using (auth.uid() = user_id and source in ('MANUAL', 'LEGACY'));

create or replace function public.sync_closed_murder_event_records()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.event_kind = 'MURDER_MYSTERY' and new.murder_mystery_id is not null and new.event_status = 'CLOSED' and old.event_status is distinct from 'CLOSED' then
    insert into public.murder_mystery_personal_records(user_id, murder_mystery_id, participation_role, played_at, source, event_id)
    select participant.user_id, new.murder_mystery_id, participant.participation_role,
      (coalesce(new.ended_at, new.started_at) at time zone 'Asia/Seoul')::date, 'EVENT', new.id
    from public.event_participants participant
    where participant.event_id = new.id and coalesce(participant.attendance_status, 'REGISTERED') <> 'ABSENT'
    on conflict (event_id, user_id) where event_id is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_closed_murder_event_records_trigger on public.events;
create trigger sync_closed_murder_event_records_trigger after update of event_status on public.events for each row execute function public.sync_closed_murder_event_records();

insert into public.murder_mystery_personal_records(user_id, murder_mystery_id, participation_role, played_at, source)
select history.user_id, history.murder_mystery_id, history.participation_role, coalesce(history.completed_at::date, current_date), 'LEGACY'
from public.murder_mystery_history history
where not exists (
  select 1 from public.murder_mystery_personal_records record
  where record.user_id = history.user_id and record.murder_mystery_id = history.murder_mystery_id
    and record.participation_role = history.participation_role and record.played_at = coalesce(history.completed_at::date, current_date)
);

insert into public.murder_mystery_personal_records(user_id, murder_mystery_id, participation_role, played_at, source, event_id)
select participant.user_id, event.murder_mystery_id, participant.participation_role,
  (coalesce(event.ended_at, event.started_at) at time zone 'Asia/Seoul')::date, 'EVENT', event.id
from public.events event join public.event_participants participant on participant.event_id = event.id
where event.event_kind = 'MURDER_MYSTERY' and event.murder_mystery_id is not null and event.event_status = 'CLOSED'
  and coalesce(participant.attendance_status, 'REGISTERED') <> 'ABSENT'
on conflict (event_id, user_id) where event_id is not null do nothing;
