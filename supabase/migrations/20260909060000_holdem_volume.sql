begin;
lock table public.events in share row exclusive mode;
create table public.event_kind_counters (
 event_kind text primary key,
 last_volume integer not null check (last_volume >= 0)
);
alter table public.event_kind_counters enable row level security;
revoke all on public.event_kind_counters from anon,authenticated;

-- Give existing unnumbered Holdem events their creation-order volumes.
with pending as (
 select id, (select coalesce(max(volume_number),0) from public.events where event_kind='HOLDEM')
 + row_number() over(order by created_at,id)::integer as volume
 from public.events where event_kind='HOLDEM' and volume_number is null
)
update public.events e set volume_number=p.volume,
 title=regexp_replace(btrim(e.title),'[[:space:]]+[Vv][Oo][Ll][.]?[[:space:]]*[0-9]+[[:space:]]*$','') || ' Vol.' || p.volume
from pending p where e.id=p.id;

insert into public.event_kind_counters(event_kind,last_volume)
select 'HOLDEM',coalesce(max(volume_number),0) from public.events where event_kind='HOLDEM';
create unique index holdem_event_volume_unique on public.events(volume_number) where event_kind='HOLDEM';

create function public.assign_holdem_volume()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.event_kind <> 'HOLDEM' then return new; end if;
 if tg_op='INSERT' then
   update public.event_kind_counters set last_volume=last_volume+1 where event_kind='HOLDEM' returning last_volume into new.volume_number;
 else
   new.volume_number:=old.volume_number;
 end if;
 new.title:=regexp_replace(btrim(new.title),'[[:space:]]+[Vv][Oo][Ll][.]?[[:space:]]*[0-9]+[[:space:]]*$','') || ' Vol.' || new.volume_number;
 return new;
end;
$$;
revoke all on function public.assign_holdem_volume() from public,anon,authenticated;
create trigger assign_holdem_volume before insert or update of title,volume_number on public.events
for each row execute function public.assign_holdem_volume();
commit;
