begin;

alter table public.tichu_rooms
  add column if not exists deity_human_bonus text;

alter table public.tichu_rooms
  drop constraint if exists tichu_rooms_deity_human_bonus_check;
alter table public.tichu_rooms
  add constraint tichu_rooms_deity_human_bonus_check
  check (deity_human_bonus is null or deity_human_bonus in ('power_one', 'king_pair', 'king_one'));

-- Pick the human challenge bonus before the first eight cards are shown.  The
-- boss receives its guaranteed control cards in those first eight cards, so
-- the later six-card deal can preserve both the guarantee and the Grand Tichu
-- decision that was made from the visible opening hand.
create or replace function public.tichu_prepare_deity_opening()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deck int[];
  opening int[];
  human_opening int[];
  player_row record;
  deity_id uuid;
  human_id uuid;
  bucket text;
  roll numeric;
  valid_deal boolean;
  attempt int := 0;
begin
  if new.status <> 'GRAND' or old.status not in ('WAITING', 'ROUND_END') then
    return new;
  end if;

  select user_id into deity_id
  from public.tichu_players
  where room_id = new.id and is_bot and bot_difficulty = 'deity'
  limit 1;
  if deity_id is null then
    new.deity_human_bonus := null;
    return new;
  end if;

  select user_id into human_id
  from public.tichu_players
  where room_id = new.id and not is_bot
  order by (user_id = new.host_id) desc, seat
  limit 1;

  roll := random();
  bucket := case
    when roll < 0.20 then 'power_one'
    when roll < 0.50 then 'king_pair'
    else 'king_one'
  end;
  new.deity_human_bonus := bucket;

  loop
    attempt := attempt + 1;
    select array_agg(card order by random()) into deck
    from generate_series(0, 55) card;
    valid_deal := true;

    for player_row in
      select p.user_id, p.seat, p.is_bot, p.bot_difficulty
      from public.tichu_players p
      where p.room_id = new.id
      order by p.seat
    loop
      select array_agg(deck[i] order by deck[i]) into opening
      from generate_series(player_row.seat * 8 + 1, player_row.seat * 8 + 8) i;

      if player_row.user_id = deity_id and (
        (select count(*) from unnest(opening) card where card between 48 and 51) < 1 or
        (select count(*) from unnest(opening) card where card between 44 and 47) < 2
      ) then
        valid_deal := false;
        exit;
      end if;

      if player_row.user_id = human_id then
        human_opening := opening;
        if not public.tichu_god_safe_hand(opening) then
          valid_deal := false;
          exit;
        end if;
        if bucket = 'power_one' and
          (select count(*) from unnest(opening) card where card between 48 and 51 or card in (54, 55)) > 1
        then
          valid_deal := false;
          exit;
        elsif bucket = 'king_pair' and
          (select count(*) from unnest(opening) card where card between 44 and 47) > 2
        then
          valid_deal := false;
          exit;
        elsif bucket = 'king_one' and
          (select count(*) from unnest(opening) card where card between 44 and 47) > 1
        then
          valid_deal := false;
          exit;
        end if;
      end if;
    end loop;

    if valid_deal and bucket = 'power_one' and
      (select count(*) from unnest(human_opening) card where card between 48 and 51 or card in (54, 55)) = 0 and
      not exists (
        select 1 from generate_series(33, 56) i
        where deck[i] between 48 and 51 or deck[i] in (54, 55)
      )
    then
      valid_deal := false;
    elsif valid_deal and bucket = 'king_pair' and
      (select count(*) from unnest(human_opening) card where card between 44 and 47) +
      (select count(*) from generate_series(33, 56) i where deck[i] between 44 and 47) < 2
    then
      valid_deal := false;
    elsif valid_deal and bucket = 'king_one' and
      (select count(*) from unnest(human_opening) card where card between 44 and 47) = 0 and
      not exists (select 1 from generate_series(33, 56) i where deck[i] between 44 and 47)
    then
      valid_deal := false;
    end if;

    exit when valid_deal;
    if attempt >= 20000 then
      raise exception '티츄신 대전용 최초 8장 배분 조건을 만들지 못했습니다. 다시 시작해 주세요.';
    end if;
  end loop;

  for player_row in
    select user_id, seat from public.tichu_players where room_id = new.id order by seat
  loop
    select array_agg(deck[i] order by deck[i]) into opening
    from generate_series(player_row.seat * 8 + 1, player_row.seat * 8 + 8) i;
    update public.tichu_hands
    set cards = opening, initial_cards = opening
    where room_id = new.id and user_id = player_row.user_id;
  end loop;

  return new;
end;
$$;

drop trigger if exists tichu_prepare_deity_opening_trigger on public.tichu_rooms;
create trigger tichu_prepare_deity_opening_trigger
before update of status on public.tichu_rooms
for each row execute function public.tichu_prepare_deity_opening();

-- Preserve the visible first eight cards, then reshuffle only the final six per
-- player until the selected human bonus and the deity guarantees are present
-- in the actual fourteen-card starting hands.
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
  deity_id uuid;
  human_id uuid;
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
    where room_id = new.id and is_bot and bot_difficulty in ('god', 'deity')
  );
  select user_id into deity_id from public.tichu_players
  where room_id = new.id and is_bot and bot_difficulty = 'deity' limit 1;
  select user_id into human_id from public.tichu_players
  where room_id = new.id and not is_bot
  order by (user_id = new.host_id) desc, seat limit 1;

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
      select p.user_id, p.seat, p.team, p.is_bot, p.bot_difficulty, h.initial_cards
      from public.tichu_players p
      join public.tichu_hands h using (room_id, user_id)
      where p.room_id = new.id
      order by p.seat
    loop
      candidate := player_row.initial_cards || (
        select array_agg(shuffled[i])
        from generate_series(player_row.seat * 6 + 1, player_row.seat * 6 + 6) i
      );

      if player_row.is_bot and (
        select count(*) from unnest(candidate) card
        where public.tichu_bot_safe_opponent_gift(card)
      ) < 3 then
        valid_deal := false;
        exit;
      elsif not player_row.is_bot and god_room and not public.tichu_god_safe_hand(candidate) then
        valid_deal := false;
        exit;
      end if;

      if player_row.user_id = deity_id and (
        (select count(*) from unnest(candidate) card where card between 48 and 51) < 1 or
        (select count(*) from unnest(candidate) card where card between 44 and 47) < 2
      ) then
        valid_deal := false;
        exit;
      end if;

      if player_row.user_id = human_id then
        if new.deity_human_bonus = 'power_one' and
          (select count(*) from unnest(candidate) card where card between 48 and 51 or card in (54, 55)) <> 1
        then
          valid_deal := false;
          exit;
        elsif new.deity_human_bonus = 'king_pair' and
          (select count(*) from unnest(candidate) card where card between 44 and 47) <> 2
        then
          valid_deal := false;
          exit;
        elsif new.deity_human_bonus = 'king_one' and
          (select count(*) from unnest(candidate) card where card between 44 and 47) <> 1
        then
          valid_deal := false;
          exit;
        end if;
      end if;
    end loop;

    exit when valid_deal;
    if attempt >= 20000 then
      raise exception '티츄신 대전용 최종 14장 배분 조건을 만들지 못했습니다. 다시 시작해 주세요.';
    end if;
  end loop;

  for player_row in
    select user_id, seat from public.tichu_players where room_id = new.id order by seat
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

-- In individual play, a God/Deity bot uses Dog to give the lead to the active
-- player immediately before a 1-3 card threat.  That receiver must not itself
-- be on 1-2 cards; otherwise choose a safer receiver.
create or replace function public.tichu_strategic_dog_target(
  p_room uuid,
  p_bot uuid
) returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bot_seat int;
  danger record;
  receiver int;
begin
  select seat into bot_seat from public.tichu_players
  where room_id = p_room and user_id = p_bot;

  for danger in
    select p.seat, cardinality(h.cards) as card_count
    from public.tichu_players p
    join public.tichu_hands h using (room_id, user_id)
    where p.room_id = p_room and p.user_id <> p_bot
      and cardinality(h.cards) between 1 and 3
    order by cardinality(h.cards), ((p.seat - bot_seat + 4) % 4)
  loop
    select p.seat into receiver
    from public.tichu_players p
    join public.tichu_hands h using (room_id, user_id)
    where p.room_id = p_room and p.user_id <> p_bot
      and p.seat <> danger.seat and cardinality(h.cards) > 2
    order by ((danger.seat - p.seat + 4) % 4)
    limit 1;
    if receiver is not null then return receiver; end if;
  end loop;

  select p.seat into receiver
  from public.tichu_players p
  join public.tichu_hands h using (room_id, user_id)
  where p.room_id = p_room and p.user_id <> p_bot and cardinality(h.cards) > 2
  order by ((p.seat - bot_seat + 4) % 4)
  limit 1;
  if receiver is not null then return receiver; end if;

  select p.seat into receiver
  from public.tichu_players p
  join public.tichu_hands h using (room_id, user_id)
  where p.room_id = p_room and p.user_id <> p_bot and cardinality(h.cards) > 0
  order by ((p.seat - bot_seat + 4) % 4)
  limit 1;
  return receiver;
end;
$$;

-- Expand the deity's exact response ceiling from one human hand to every
-- active opponent hand, including AI.  Each opponent is enumerated separately
-- to avoid an exponential search across a combined 42-card set.
do $$
declare
  fn text;
  changed text;
  old_target text := E'select h.cards, cardinality(h.cards) into target_hand, target_count\n  from public.tichu_players p join public.tichu_hands h using(room_id,user_id)\n  where p.room_id=p_room and not p.is_bot and cardinality(h.cards)>0\n  order by ((p.seat-bot_seat+4)%4), cardinality(h.cards) limit 1;\n  if target_hand is null then return base_play; end if;';
  new_target text := E'select h.cards, cardinality(h.cards) into target_hand, target_count\n  from public.tichu_players p join public.tichu_hands h using(room_id,user_id)\n  where p.room_id=p_room and p.user_id<>p_bot and cardinality(h.cards)>0\n  order by cardinality(h.cards), ((p.seat-bot_seat+4)%4) limit 1;\n  if target_hand is null then return base_play; end if;';
  old_dog text := E'if room_row.game_mode=''INDIVIDUAL'' then select p.seat into next_seat from tichu_players p join tichu_hands h using(room_id,user_id) where p.room_id=p_room and p.user_id<>bot.user_id and cardinality(h.cards)>0 order by ((p.seat-bot.seat+4)%4) limit 1; if next_seat is null then perform tichu_end_round(p_room); return; end if; else select seat into next_seat from tichu_players where room_id=p_room and team=bot.team and user_id<>bot.user_id; end if;';
  new_dog text := E'if room_row.game_mode=''INDIVIDUAL'' then if bot.bot_difficulty in (''god'',''deity'') then next_seat:=public.tichu_strategic_dog_target(p_room,bot.user_id); else select p.seat into next_seat from tichu_players p join tichu_hands h using(room_id,user_id) where p.room_id=p_room and p.user_id<>bot.user_id and cardinality(h.cards)>0 order by ((p.seat-bot.seat+4)%4) limit 1; end if; if next_seat is null then perform tichu_end_round(p_room); return; end if; else select seat into next_seat from tichu_players where room_id=p_room and team=bot.team and user_id<>bot.user_id; end if;';
begin
  select pg_get_functiondef(
    'public.tichu_deity_best_play(uuid,uuid,int,int[],jsonb,int)'::regprocedure
  ) into fn;
  changed := replace(fn, 'wish_required boolean;', E'wish_required boolean;\n  opponent record;');
  changed := replace(changed, old_target, new_target);
  changed := regexp_replace(
    changed,
    'hn := cardinality\(target_hand\);.*?\n\s*wish_required :=',
    E'for opponent in\n    select h.cards\n    from public.tichu_players p join public.tichu_hands h using(room_id,user_id)\n    where p.room_id=p_room and p.user_id<>p_bot and cardinality(h.cards)>0\n  loop\n    target_hand:=opponent.cards;\n    hn:=cardinality(target_hand);\n    for mask in 1..(power(2,hn)::int-1) loop\n      subset:=''{}'';\n      for i in 1..hn loop\n        if (mask/power(2,i-1)::int)%2=1 then subset:=array_append(subset,target_hand[i]); end if;\n      end loop;\n      if 53=any(subset) then continue; end if;\n      made:=public.tichu_classify_cards(subset,null);\n      if made is null then continue; end if;\n      if (made->>''bomb'')::boolean then\n        if made->>''kind''=''four'' then bomb_four:=greatest(bomb_four,(made->>''strength'')::numeric);\n        elsif (made->>''size'')::int>bomb_straight_size or ((made->>''size'')::int=bomb_straight_size and (made->>''strength'')::numeric>bomb_straight_strength) then\n          bomb_straight_size:=(made->>''size'')::int; bomb_straight_strength:=(made->>''strength'')::numeric;\n        end if;\n      else\n        key_name:=(made->>''kind'')||'':''||(made->>''size'');\n        ceilings:=jsonb_set(ceilings,array[key_name],to_jsonb(greatest(coalesce((ceilings->>key_name)::numeric,0),(made->>''strength'')::numeric)),true);\n      end if;\n    end loop;\n  end loop;\n\n  wish_required :=',
    'ins'
  );
  if changed = fn or strpos(changed, 'for opponent in') = 0 then
    raise exception '티츄신 전원 손패 계산 로직을 설치하지 못했습니다.';
  end if;
  execute changed;

  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  if strpos(fn, 'tichu_strategic_dog_target') = 0 then
    changed := replace(fn, old_dog, new_dog);
    if changed = fn then raise exception '신급 AI 개 카드 대상 로직을 찾지 못했습니다.'; end if;
    execute changed;
  end if;
end;
$$;

revoke all on function public.tichu_prepare_deity_opening() from public, anon, authenticated;
revoke all on function public.tichu_strategic_dog_target(uuid,uuid) from public, anon, authenticated;

commit;
