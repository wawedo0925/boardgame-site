begin;

create or replace function public.tichu_undo_gift(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.tichu_rooms%rowtype;
  exchange_row public.tichu_exchanges%rowtype;
  recent_card int;
  recent_target text;
begin
  perform public.tichu_assert_member(p_room);

  select * into room_row
  from public.tichu_rooms
  where id = p_room
  for update;

  if room_row.status <> 'EXCHANGE' then
    raise exception '교환 단계가 아닙니다.';
  end if;
  if room_row.exchange_deadline is not null and room_row.exchange_deadline <= now() then
    raise exception '카드 교환 시간이 끝났습니다.';
  end if;

  select * into exchange_row
  from public.tichu_exchanges
  where room_id = p_room and user_id = auth.uid()
  for update;

  if not found or coalesce(cardinality(exchange_row.cards), 0) = 0 then
    raise exception '번복할 카드가 없습니다.';
  end if;

  recent_card := exchange_row.cards[array_upper(exchange_row.cards, 1)];
  select gift.key into recent_target
  from jsonb_each(exchange_row.gifts) gift
  where (gift.value #>> '{}')::int = recent_card
  limit 1;

  if recent_target is null then
    raise exception '최근 교환 기록을 찾지 못했습니다. 카드를 다시 선택해 주세요.';
  end if;

  update public.tichu_exchanges
  set cards = cards[1:greatest(coalesce(array_upper(cards, 1), 1) - 1, 0)],
      gifts = gifts - recent_target
  where room_id = p_room and user_id = auth.uid();

  update public.tichu_rooms
  set revision = revision + 1,
      updated_at = now()
  where id = p_room;
end;
$$;

revoke all on function public.tichu_undo_gift(uuid) from public, anon;
grant execute on function public.tichu_undo_gift(uuid) to authenticated;

commit;
