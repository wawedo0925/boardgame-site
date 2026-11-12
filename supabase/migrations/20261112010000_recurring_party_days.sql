-- Party days share the daily rolling two-month generator, without automatic attendance.
begin;
alter table public.event_recurrence_series
  add column if not exists skip_occupied_dates boolean not null default false,
  add column if not exists sequential_volumes boolean not null default false,
  add column if not exists auto_join_creator boolean not null default true;
create or replace function public.generate_recurring_events(p_series_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.event_recurrence_series%rowtype;
  occurrence_date date;
  horizon date;
  generated_volume integer;
  new_event_id uuid;
  inserted_count integer := 0;
begin
  lock table public.events in share row exclusive mode;
  for s in
    select *
    from public.event_recurrence_series
    where is_active
      and (p_series_id is null or id = p_series_id)
    order by skip_occupied_dates, id
  loop
    horizon := (current_date + interval '2 months')::date;
    occurrence_date := greatest(s.first_date, current_date);

    while occurrence_date <= horizon loop
      if mod(occurrence_date - s.first_date, s.interval_weeks * 7) = 0
         and not exists (
           select 1
           from public.event_recurrence_exceptions x
           where x.series_id = s.id
             and x.exception_date = occurrence_date
         )
         and not exists (
           select 1
           from public.events e
           where e.recurrence_series_id = s.id
             and e.recurrence_date = occurrence_date
         )
         and (not s.skip_occupied_dates or not exists (
           select 1 from public.events occupied
           where (occupied.started_at at time zone 'Asia/Seoul')::date = occurrence_date
         )) then
        generated_volume := s.volume_seed
          + ((occurrence_date - s.first_date) / (s.interval_weeks * 7));

        if s.sequential_volumes then
          select greatest(s.volume_seed, coalesce(max(volume_number) + 1, s.volume_seed))
          into generated_volume from public.events where recurrence_series_id = s.id;
          update public.event_recurrence_series set volume_seed = generated_volume + 1 where id = s.id;
        end if;

        insert into public.events(
          title, started_at, ended_at, location, description, created_by,
          max_participants, event_kind, murder_mystery_id,
          recurrence_series_id, recurrence_date, volume_number,
          recurrence_base_title, participation_fee
        )
        values (
          s.title || ' Vol.' || generated_volume,
          (occurrence_date + s.start_time) at time zone 'Asia/Seoul',
          case
            when s.end_time is null then null
            else (occurrence_date + s.end_time) at time zone 'Asia/Seoul'
          end,
          s.location, s.description, s.created_by, s.max_participants,
          s.event_kind, s.murder_mystery_id, s.id, occurrence_date,
          generated_volume, s.title, s.participation_fee
        )
        returning id into new_event_id;

        if s.auto_join_creator then
        insert into public.event_participants(event_id, user_id, participation_role)
        values (new_event_id, s.created_by, s.creator_role)
        on conflict do nothing;

        if s.event_kind = 'MURDER_MYSTERY' and s.creator_role = 'GM' then
          insert into public.event_staff(event_id, user_id, duty, assigned_by)
          values (new_event_id, s.created_by, 'GM', s.created_by)
          on conflict do nothing;
        end if;

        end if;

        inserted_count := inserted_count + 1;
      end if;

      occurrence_date := occurrence_date + 1;
    end loop;
  end loop;

  return inserted_count;
end;
$$;

do $$
declare series_id uuid; owner_id uuid := '330488c9-cce1-4758-a70a-3ff63b676ea8';
begin
  select id into series_id from public.event_recurrence_series where title = '[팟 데이] 팟참가자만';
  if series_id is null then
    insert into public.event_recurrence_series(title,start_time,end_time,first_date,interval_weeks,
      location,description,max_participants,event_kind,created_by,creator_role,participation_fee,
      volume_seed,skip_occupied_dates,sequential_volumes,auto_join_creator)
    select '[팟 데이] 팟참가자만','19:20'::time,'22:20'::time,'2026-11-18'::date,1,
      location,description,max_participants,event_kind,created_by,'PLAYER',10000,7,true,true,false
    from public.events where id='274f65ea-675f-4b44-96e6-b6872f6bba99'
    returning id into series_id;
  end if;
  if series_id is null then raise exception 'Party day template missing'; end if;
  update public.events set recurrence_series_id=series_id,
    recurrence_date=(started_at at time zone 'Asia/Seoul')::date,
    recurrence_base_title='[팟 데이] 팟참가자만'
  where title like '[팟 데이] 팟참가자만 Vol.%' and created_by=owner_id and started_at>now();
  -- Upcoming automatic attendance can be restored by joining through the site.
  delete from public.event_group_members where user_id=owner_id and group_id in (
    select g.id from public.event_groups g join public.events e on e.id=g.event_id
    where e.recurrence_series_id=series_id and e.started_at>now());
  delete from public.event_participants where user_id=owner_id and event_id in (
    select id from public.events where recurrence_series_id=series_id and started_at>now());
  perform public.generate_recurring_events(series_id);
  if not exists(select 1 from cron.job where jobname='generate-recurring-events-two-months' and active) then
    raise exception 'Daily recurrence job is not active';
  end if;
end $$;
commit;
select e.title, e.recurrence_date, s.is_active, s.auto_join_creator,
  (select count(*) from public.event_participants p where p.event_id=e.id and p.user_id=e.created_by) as owner_participating
from public.events e join public.event_recurrence_series s on s.id=e.recurrence_series_id
where s.title='[팟 데이] 팟참가자만' order by e.started_at;
