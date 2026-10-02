begin;

create or replace function public.auto_join_regular_boardgame_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_kind = 'BOARDGAME'
     and (
       new.recurrence_base_title in (
         '[화/정기] 보드게임',
         '[목/정기] 보드게임',
         '[일/정기] 보드게임'
       )
       or new.title ~ '^\[(화|목|일)/정기\] 보드게임'
     ) then
    insert into public.event_participants(event_id, user_id, participation_role)
    values
      (new.id, '5aaef3b1-4235-49b2-a380-66c7d2adc999'::uuid, 'PLAYER'),
      (new.id, '286c045b-4ba1-48cf-adb3-42bffa1e3140'::uuid, 'PLAYER')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists auto_join_regular_boardgame_staff on public.events;
create trigger auto_join_regular_boardgame_staff
after insert on public.events
for each row execute function public.auto_join_regular_boardgame_staff();

-- Join every currently available Tuesday, Thursday, and Sunday regular meetup.
insert into public.event_participants(event_id, user_id, participation_role)
select e.id, staff.user_id, 'PLAYER'
from public.events e
cross join (
  values
    ('5aaef3b1-4235-49b2-a380-66c7d2adc999'::uuid),
    ('286c045b-4ba1-48cf-adb3-42bffa1e3140'::uuid)
) as staff(user_id)
where e.event_kind = 'BOARDGAME'
  and e.event_status = 'OPEN'
  and coalesce(e.ended_at, e.started_at) >= now()
  and (
    e.recurrence_base_title in (
      '[화/정기] 보드게임',
      '[목/정기] 보드게임',
      '[일/정기] 보드게임'
    )
    or e.title ~ '^\[(화|목|일)/정기\] 보드게임'
  )
on conflict do nothing;

commit;
