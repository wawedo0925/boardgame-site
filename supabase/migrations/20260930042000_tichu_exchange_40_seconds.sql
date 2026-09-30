begin;

create or replace function public.tichu_set_exchange_deadline()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.status='EXCHANGE' and old.status is distinct from new.status then
    new.exchange_deadline:=now()+interval '40 seconds';
  elsif new.status<>'EXCHANGE' then
    new.exchange_deadline:=null;
  end if;
  return new;
end
$$;

-- Give an in-progress exchange a fresh full window when this change is applied.
update public.tichu_rooms
set exchange_deadline=now()+interval '40 seconds',
    revision=revision+1
where status='EXCHANGE';

commit;
