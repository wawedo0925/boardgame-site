-- Keep the database fallback aligned with the 시계탑에 흐른 피 event form.

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
      when 'CLOCKTOWER' then 10000
      else 0
    end);
  end if;

  return new;
end;
$$;
