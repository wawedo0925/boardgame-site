-- Event participation fees and recurring-series fee defaults.

alter table public.events
  add column if not exists participation_fee integer;

alter table public.event_recurrence_series
  add column if not exists participation_fee integer;

update public.events
set participation_fee = case event_kind
  when 'BOARDGAME' then 10000
  when 'MURDER_MYSTERY' then 13000
  else 0
end
where participation_fee is null;

update public.event_recurrence_series
set participation_fee = case event_kind
  when 'BOARDGAME' then 10000
  when 'MURDER_MYSTERY' then 13000
  else 0
end
where participation_fee is null;

alter table public.events
  alter column participation_fee drop default,
  alter column participation_fee set not null;
alter table public.events
  drop constraint if exists events_participation_fee_check;
alter table public.events
  add constraint events_participation_fee_check check (participation_fee >= 0);

alter table public.event_recurrence_series
  alter column participation_fee drop default,
  alter column participation_fee set not null;
alter table public.event_recurrence_series
  drop constraint if exists event_recurrence_series_participation_fee_check;
alter table public.event_recurrence_series
  add constraint event_recurrence_series_participation_fee_check check (participation_fee >= 0);

create or replace function public.apply_event_participation_fee_default()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.participation_fee is null then
    if new.recurrence_series_id is not null then
      select participation_fee into new.participation_fee
      from public.event_recurrence_series
      where id = new.recurrence_series_id;
    end if;
    new.participation_fee := coalesce(new.participation_fee, case new.event_kind
      when 'BOARDGAME' then 10000
      when 'MURDER_MYSTERY' then 13000
      else 0
    end);
  end if;
  return new;
end;
$$;

drop trigger if exists apply_event_participation_fee_default on public.events;
create trigger apply_event_participation_fee_default
before insert on public.events
for each row execute function public.apply_event_participation_fee_default();

create or replace function public.create_recurring_event_series(
  p_title text, p_started_at timestamptz, p_ended_at timestamptz, p_location text,
  p_description text, p_max_participants integer, p_event_kind text,
  p_murder_mystery_id uuid, p_interval_weeks integer, p_creator_role text,
  p_participation_fee integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  first_event_id uuid;
  series_id uuid;
begin
  if p_participation_fee < 0 then raise exception '참가비는 0원 이상이어야 합니다.'; end if;
  first_event_id := public.create_recurring_event_series(
    p_title, p_started_at, p_ended_at, p_location, p_description,
    p_max_participants, p_event_kind, p_murder_mystery_id,
    p_interval_weeks, p_creator_role
  );
  select recurrence_series_id into series_id from public.events where id = first_event_id;
  update public.event_recurrence_series set participation_fee = p_participation_fee where id = series_id;
  update public.events set participation_fee = p_participation_fee where recurrence_series_id = series_id;
  return first_event_id;
end;
$$;

create or replace function public.update_event_participation_fee(p_event_id uuid, p_fee integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.events%rowtype;
  actor uuid := auth.uid();
begin
  select * into target from public.events where id = p_event_id for update;
  if not found then raise exception '이벤트를 찾을 수 없습니다.'; end if;
  if p_fee < 0 then raise exception '참가비는 0원 이상이어야 합니다.'; end if;
  if target.started_at <= now() then raise exception '이미 시작한 이벤트의 참가비는 변경할 수 없습니다.'; end if;
  if public.current_site_role() not in ('MAIN_ADMIN', 'ADMIN')
     and not (public.current_site_role() = 'RULE_MASTER' and target.created_by = actor) then
    raise exception '참가비 변경 권한이 없습니다.';
  end if;
  update public.events set participation_fee = p_fee where id = p_event_id;
end;
$$;

grant execute on function public.create_recurring_event_series(text,timestamptz,timestamptz,text,text,integer,text,uuid,integer,text,integer) to authenticated;
revoke all on function public.update_event_participation_fee(uuid,integer) from public, anon;
grant execute on function public.update_event_participation_fee(uuid,integer) to authenticated;
