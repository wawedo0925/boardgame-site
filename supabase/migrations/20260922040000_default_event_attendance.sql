begin;

alter table public.event_participants alter column attendance_status set default 'PRESENT';

-- Cover direct joins, operator assignments and waitlist promotions, including
-- older callers that explicitly send REGISTERED. Later manual changes stay valid.
create or replace function public.default_event_participant_attendance()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.attendance_status is null or new.attendance_status='REGISTERED' then
    new.attendance_status:='PRESENT';
  end if;
  if new.attendance_status='PRESENT' and new.attendance_checked_at is null then
    new.attendance_checked_at:=now();
  end if;
  return new;
end;
$$;
create trigger default_event_participant_attendance_trigger
before insert on public.event_participants
for each row execute function public.default_event_participant_attendance();

-- Keep historical records, closed/cancelled events and explicit absences intact.
update public.event_participants p
set attendance_status='PRESENT', attendance_checked_at=now()
from public.events e
where e.id=p.event_id and e.event_status='OPEN' and e.ended_at>=now()
  and coalesce(p.attendance_status,'REGISTERED')='REGISTERED';

commit;
