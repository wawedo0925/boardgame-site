begin;
alter table public.events drop constraint events_event_kind_check;
alter table public.events add constraint events_event_kind_check check (event_kind in ('GENERAL','BOARDGAME','MURDER_MYSTERY','CLOCKTOWER','HOLDEM'));
alter table public.events add constraint holdem_events_are_single check (event_kind <> 'HOLDEM' or recurrence_series_id is null);
alter table public.event_recurrence_series add constraint no_holdem_recurrence check (event_kind <> 'HOLDEM');

create or replace function public.apply_event_participation_fee_default()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.participation_fee is null then
    if new.recurrence_series_id is not null then
      select participation_fee into new.participation_fee from public.event_recurrence_series where id=new.recurrence_series_id;
    end if;
    new.participation_fee:=coalesce(new.participation_fee,case new.event_kind
      when 'BOARDGAME' then 10000 when 'MURDER_MYSTERY' then 13000
      when 'CLOCKTOWER' then 10000 when 'HOLDEM' then 10000 else 0 end);
  end if;
  return new;
end;
$$;

create or replace function public.event_notification_label(p_started_at timestamptz,p_kind text)
returns text language sql stable set search_path=public as $$
 select to_char(p_started_at at time zone 'Asia/Seoul','FMMM/FMDD') || ' ' ||
 case p_kind when 'BOARDGAME' then '보겜' when 'MURDER_MYSTERY' then '머미'
 when 'CLOCKTOWER' then '시계탑' when 'HOLDEM' then '홀덤' else '일반' end;
$$;
commit;
