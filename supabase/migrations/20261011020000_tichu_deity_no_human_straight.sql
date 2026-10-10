begin;

create or replace function public.tichu_hand_has_straight(p_hand int[])
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  start_rank int;
  rank_no int;
  missing int;
  has_phoenix boolean := 54 = any(p_hand);
begin
  -- Every straight of five or more contains a five-rank window. Mahjong is
  -- rank 1 and Phoenix may fill exactly one absent rank in that window.
  for start_rank in 1..10 loop
    missing := 0;
    for rank_no in start_rank..(start_rank + 4) loop
      if not (
        (rank_no = 1 and 52 = any(p_hand))
        or exists (
          select 1 from unnest(p_hand) card
          where card < 52 and card / 4 + 2 = rank_no
        )
      ) then
        missing := missing + 1;
      end if;
    end loop;
    if missing = 0 or (missing = 1 and has_phoenix) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Human opening hands in God/Deity games must not contain any ready-made
-- straight, including Mahjong starts and Phoenix-completed sequences.
create or replace function public.tichu_god_safe_hand(p_cards int[])
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if (select count(*) from unnest(p_cards) card where card between 48 and 51) > 1 then
    return false;
  end if;
  if public.tichu_hand_has_bomb(p_cards) then
    return false;
  end if;
  if public.tichu_hand_has_straight(p_cards) then
    return false;
  end if;
  return true;
end;
$$;

-- The previous challenge selector minimized straight potential. Make the
-- restriction absolute: a candidate gift is invalid if the human could form
-- any straight after receiving it.
create or replace function public.tichu_deity_exchange_gift(
  p_room uuid,
  p_bot uuid,
  p_target uuid,
  p_hand int[],
  p_chosen int[]
) returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_hand int[];
  outgoing int[] := '{}';
  incoming int[] := '{}';
  candidate int;
begin
  select h.cards into target_hand
  from public.tichu_hands h
  where h.room_id = p_room and h.user_id = p_target;

  select coalesce(e.cards, '{}') into outgoing
  from public.tichu_exchanges e
  where e.room_id = p_room and e.user_id = p_target;
  if not found then outgoing := '{}'; end if;

  select coalesce(array_agg((gift.value #>> '{}')::int), '{}') into incoming
  from public.tichu_exchanges e
  cross join lateral jsonb_each(e.gifts) gift
  where e.room_id = p_room
    and e.user_id <> p_target
    and gift.key = p_target::text;

  target_hand := array(
    select card from unnest(target_hand) card where not card = any(outgoing)
  ) || incoming;

  select card into candidate
  from unnest(p_hand) card
  where not card = any(coalesce(p_chosen, '{}'))
    and public.tichu_bot_safe_opponent_gift(card)
    and not public.tichu_hand_has_bomb(target_hand || card)
    and not public.tichu_hand_has_straight(target_hand || card)
  order by
    public.tichu_human_exchange_risk(target_hand || card),
    case when card in (52, 53) then 20 else card / 4 + 2 end,
    card
  limit 1;

  if candidate is null then
    raise exception '플레이어에게 스트레이트나 폭탄을 만들지 않는 교환 카드를 찾지 못했습니다.';
  end if;
  return candidate;
end;
$$;

do $$
begin
  if not public.tichu_hand_has_straight(array[0,4,8,12,16]) then
    raise exception '일반 스트레이트 검증에 실패했습니다.';
  end if;
  if not public.tichu_hand_has_straight(array[0,4,8,12,54]) then
    raise exception '봉황 스트레이트 검증에 실패했습니다.';
  end if;
  if not public.tichu_hand_has_straight(array[52,0,4,8,12]) then
    raise exception '참새 스트레이트 검증에 실패했습니다.';
  end if;
  if public.tichu_hand_has_straight(array[0,4,8,16,20]) then
    raise exception '불연속 손패를 스트레이트로 잘못 판정했습니다.';
  end if;
end;
$$;

revoke all on function public.tichu_hand_has_straight(int[]) from public, anon, authenticated;

commit;
