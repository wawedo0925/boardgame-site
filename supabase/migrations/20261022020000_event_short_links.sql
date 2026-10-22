begin;
lock table public.events in share row exclusive mode;

alter table public.events add column short_code text;
create table public.event_short_link_counters (
 prefix text primary key check(prefix in ('m','c','b','h','g')),
 last_number bigint not null check(last_number>=0)
);
alter table public.event_short_link_counters enable row level security;
revoke all on public.event_short_link_counters from public,anon,authenticated;

-- Existing events receive a stable chronological number within their kind.
with numbered as (
 select id,
 case event_kind when 'MURDER_MYSTERY' then 'm' when 'CLOCKTOWER' then 'c'
 when 'BOARDGAME' then 'b' when 'HOLDEM' then 'h' else 'g' end as prefix,
 row_number() over(partition by event_kind order by started_at,created_at,id) as n
 from public.events
)
update public.events e set short_code=n.prefix||n.n from numbered n where e.id=n.id;
insert into public.event_short_link_counters(prefix,last_number)
select p,coalesce(max(substring(e.short_code from 2)::bigint),0)
from unnest(array['m','c','b','h','g']) as prefixes(p)
left join public.events e on left(e.short_code,1)=p group by p;
alter table public.events alter column short_code set not null;
alter table public.events add constraint events_short_code_format check(short_code ~ '^[mcbhg][1-9][0-9]*$');
create unique index events_short_code_unique on public.events(short_code);

create function public.assign_event_short_code() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_prefix text; n bigint;
begin
 if tg_op='UPDATE' then
  -- Dates, titles and even kind changes must never invalidate a shared URL.
  new.short_code:=old.short_code;return new;
 end if;
 v_prefix:=case new.event_kind when 'MURDER_MYSTERY' then 'm' when 'CLOCKTOWER' then 'c'
 when 'BOARDGAME' then 'b' when 'HOLDEM' then 'h' else 'g' end;
 update public.event_short_link_counters set last_number=last_number+1
 where event_short_link_counters.prefix=v_prefix returning last_number into n;
 new.short_code:=v_prefix||n;
 return new;
end $$;
revoke all on function public.assign_event_short_code() from public,anon,authenticated;
create trigger assign_event_short_code before insert or update of short_code on public.events
for each row execute function public.assign_event_short_code();
commit;
