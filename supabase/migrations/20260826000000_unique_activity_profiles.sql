-- Keep activity profiles distinguishable by activity name + birth year.
-- Region and gender intentionally do not participate in uniqueness.

do $$
declare
  duplicate_row record;
  base_name text;
  candidate text;
  suffix integer;
begin
  for duplicate_row in
    select id, activity_name, birth_year
    from (
      select p.*,
             row_number() over (
               partition by lower(btrim(activity_name)), btrim(birth_year::text)
               order by created_at nulls last, id
             ) as duplicate_number
      from public.profiles p
      where nullif(btrim(activity_name), '') is not null
        and birth_year is not null
    ) ranked
    where duplicate_number > 1
    order by duplicate_number, id
  loop
    base_name := btrim(duplicate_row.activity_name);
    suffix := 1;
    candidate := base_name || suffix;

    while exists (
      select 1
      from public.profiles p
      where p.id <> duplicate_row.id
        and lower(btrim(p.activity_name)) = lower(candidate)
        and btrim(p.birth_year::text) = btrim(duplicate_row.birth_year::text)
    ) loop
      suffix := suffix + 1;
      candidate := base_name || suffix;
    end loop;

    update public.profiles
    set activity_name = candidate,
        updated_at = now()
    where id = duplicate_row.id;
  end loop;
end $$;

create unique index if not exists profiles_activity_name_birth_year_uidx
on public.profiles (lower(btrim(activity_name)), btrim(birth_year::text))
where nullif(btrim(activity_name), '') is not null and birth_year is not null;

create or replace function public.ensure_unique_activity_profile_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_name text := btrim(new.activity_name);
  candidate text;
  suffix integer := 0;
  normalized_birth_year text := btrim(new.birth_year::text);
begin
  if nullif(requested_name, '') is null or new.birth_year is null then
    return new;
  end if;

  -- Serialize equal name/year saves so simultaneous registrations cannot collide.
  perform pg_advisory_xact_lock(hashtextextended(lower(requested_name) || '|' || normalized_birth_year, 0));

  candidate := requested_name;
  while exists (
    select 1
    from public.profiles p
    where p.id <> new.id
      and lower(btrim(p.activity_name)) = lower(candidate)
      and btrim(p.birth_year::text) = normalized_birth_year
  ) loop
    suffix := suffix + 1;
    candidate := requested_name || suffix;
  end loop;

  new.activity_name := candidate;
  return new;
end;
$$;

drop trigger if exists ensure_unique_activity_profile_name on public.profiles;
create trigger ensure_unique_activity_profile_name
before insert or update of activity_name, birth_year on public.profiles
for each row execute function public.ensure_unique_activity_profile_name();

