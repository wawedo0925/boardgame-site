begin;

-- A card is safe to gift to an opponent when it is below J. Mahjong and Dog
-- are also allowed; J/Q/K/A, Phoenix, and Dragon are reserved for the bot or
-- its teammate.
create or replace function public.tichu_bot_safe_opponent_gift(p_card int)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_card between 0 and 35 or p_card in (52, 53)
$$;

do $$
declare
  fn text;
  old_filter text := 'select c into gift_card from unnest(hand_cards)c where not c=any(chosen)';
  new_filter text := 'select c into gift_card from unnest(hand_cards)c where not c=any(chosen) and ((room_row.game_mode=''TEAM'' and target.team=bot.team) or public.tichu_bot_safe_opponent_gift(c))';
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;

  if strpos(fn, 'public.tichu_bot_safe_opponent_gift(c)') = 0 then
    if strpos(fn, old_filter) = 0 then
      raise exception 'Tichu bot exchange-card filter was not found';
    end if;
    fn := replace(fn, old_filter, new_filter);
    execute fn;
  end if;
end;
$$;

-- Preserve each player's first eight cards and reshuffle only the remaining
-- six-card allotments. This guarantees every AI has enough legal low cards to
-- complete its opponent gifts, while retaining the God-mode human handicap.
create or replace function public.tichu_apply_god_opening_handicap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  supplemental int[];
  shuffled int[];
  player_row record;
  candidate int[];
  attempt int := 0;
  valid_deal boolean;
  god_room boolean;
begin
  if old.status <> 'GRAND' or new.status <> 'EXCHANGE' or not exists (
    select 1 from public.tichu_players where room_id = new.id and is_bot
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.tichu_hands
    where room_id = new.id and cardinality(initial_cards) <> 8
  ) then
    return new;
  end if;

  god_room := exists (
    select 1 from public.tichu_players
    where room_id = new.id and is_bot and bot_difficulty = 'god'
  );

  select array_agg(card order by card) into supplemental
  from generate_series(0, 55) card
  where not exists (
    select 1
    from public.tichu_hands h
    cross join lateral unnest(h.initial_cards) initial_card
    where h.room_id = new.id and initial_card = card
  );

  loop
    attempt := attempt + 1;
    select array_agg(card order by random()) into shuffled
    from unnest(supplemental) card;
    valid_deal := true;

    for player_row in
      select p.user_id, p.seat, p.team, p.is_bot, h.initial_cards
      from public.tichu_players p
      join public.tichu_hands h using (room_id, user_id)
      where p.room_id = new.id
      order by p.seat
    loop
      candidate := player_row.initial_cards || (
        select array_agg(shuffled[i])
        from generate_series(player_row.seat * 6 + 1, player_row.seat * 6 + 6) i
      );

      if player_row.is_bot then
        if (select count(*) from unnest(candidate) card
            where public.tichu_bot_safe_opponent_gift(card)) < 3 then
          valid_deal := false;
          exit;
        end if;
      elsif god_room and not public.tichu_god_safe_hand(candidate) then
        valid_deal := false;
        exit;
      end if;
    end loop;

    exit when valid_deal;
    if attempt >= 10000 then
      raise exception 'AI 카드 교환 조건에 맞는 최초 손패를 배분하지 못했습니다. 다시 시작해 주세요.';
    end if;
  end loop;

  for player_row in
    select user_id, seat from public.tichu_players
    where room_id = new.id order by seat
  loop
    update public.tichu_hands
    set cards = initial_cards || (
      select array_agg(shuffled[i] order by shuffled[i])
      from generate_series(player_row.seat * 6 + 1, player_row.seat * 6 + 6) i
    )
    where room_id = new.id and user_id = player_row.user_id;
  end loop;

  return new;
end;
$$;

revoke all on function public.tichu_bot_safe_opponent_gift(int) from public, anon, authenticated;

commit;
