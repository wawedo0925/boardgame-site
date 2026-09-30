alter table public.tichu_rooms
  add column if not exists exchange_deadline timestamptz;

create or replace function public.tichu_set_exchange_deadline()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'EXCHANGE' and old.status is distinct from new.status then
    new.exchange_deadline := now() + interval '20 seconds';
  elsif new.status <> 'EXCHANGE' then
    new.exchange_deadline := null;
  end if;
  return new;
end
$$;

create or replace trigger tichu_exchange_deadline_trigger
before update of status on public.tichu_rooms
for each row execute function public.tichu_set_exchange_deadline();

update public.tichu_rooms
set exchange_deadline = now() + interval '20 seconds'
where status = 'EXCHANGE' and exchange_deadline is null;

create or replace function public.tichu_undo_gift(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.tichu_rooms%rowtype;
  given_cards int[];
  gifts jsonb;
  recent_card int;
  recent_target text;
begin
  perform public.tichu_assert_member(p_room);
  select * into room_row from public.tichu_rooms where id = p_room for update;
  if room_row.status <> 'EXCHANGE' then
    raise exception '교환 단계가 아닙니다.';
  end if;
  if room_row.exchange_deadline is not null and room_row.exchange_deadline <= now() then
    raise exception '카드 교환 시간이 끝났습니다.';
  end if;

  select e.cards, e.gifts into given_cards, gifts
  from public.tichu_exchanges e
  where e.room_id = p_room and e.user_id = auth.uid();

  if coalesce(cardinality(given_cards), 0) = 0 then
    raise exception '번복할 카드가 없습니다.';
  end if;

  recent_card := given_cards[cardinality(given_cards)];
  select key into recent_target
  from jsonb_each_text(gifts)
  where value::int = recent_card
  limit 1;

  update public.tichu_exchanges
  set cards = array_remove(cards, recent_card),
      gifts = gifts - recent_target
  where room_id = p_room and user_id = auth.uid();

  update public.tichu_rooms set revision = revision + 1 where id = p_room;
end
$$;

create or replace function public.tichu_exchange_timeout(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.tichu_rooms%rowtype;
  giver record;
  receiver record;
  hand_cards int[];
  chosen int[];
  gifts jsonb;
  gift_card int;
begin
  perform public.tichu_assert_member(p_room);
  select * into room_row from public.tichu_rooms where id = p_room for update;
  if room_row.status <> 'EXCHANGE' then return; end if;
  if room_row.exchange_deadline is not null and room_row.exchange_deadline > now() then return; end if;

  for giver in
    select p.user_id, p.seat
    from public.tichu_players p
    where p.room_id = p_room
    order by p.seat
  loop
    select h.cards into hand_cards
    from public.tichu_hands h
    where h.room_id = p_room and h.user_id = giver.user_id;

    select coalesce(e.cards, '{}'::int[]), coalesce(e.gifts, '{}'::jsonb)
    into chosen, gifts
    from public.tichu_exchanges e
    where e.room_id = p_room and e.user_id = giver.user_id;

    if not found then
      chosen := '{}'::int[];
      gifts := '{}'::jsonb;
    end if;

    for receiver in
      select p.user_id, p.seat
      from public.tichu_players p
      where p.room_id = p_room
        and p.user_id <> giver.user_id
        and not (gifts ? p.user_id::text)
      order by p.seat
    loop
      select c into gift_card
      from unnest(hand_cards) c
      where not (c = any(chosen))
      order by random()
      limit 1;

      chosen := array_append(chosen, gift_card);
      gifts := gifts || jsonb_build_object(receiver.user_id::text, gift_card);
    end loop;

    insert into public.tichu_exchanges(room_id, user_id, cards, gifts)
    values (p_room, giver.user_id, chosen, gifts)
    on conflict(room_id, user_id) do update
      set cards = excluded.cards, gifts = excluded.gifts;
  end loop;

  if (select count(*) from public.tichu_exchanges e
      where e.room_id = p_room
        and (select count(*) from jsonb_object_keys(e.gifts)) = 3) = 4 then
    perform public.tichu_finish_exchange(p_room);
  end if;
end
$$;

revoke all on function public.tichu_undo_gift(uuid), public.tichu_exchange_timeout(uuid) from public, anon;
grant execute on function public.tichu_undo_gift(uuid), public.tichu_exchange_timeout(uuid) to authenticated;
