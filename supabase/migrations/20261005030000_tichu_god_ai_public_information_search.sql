begin;

-- God AI uses only public information: remaining card counts, declarations,
-- cards already captured, and cards visible in the current trick. It evaluates
-- the shape left in its own hand and blocks the next human before that player
-- can unload a short hand or a declared Tichu.
create or replace function public.tichu_god_counted_play(
  p_room uuid,
  p_bot uuid,
  p_bot_team int,
  p_hand int[],
  p_lead jsonb,
  p_wish_rank int default null
) returns int[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  room_mode text;
  bot_seat int;
  next_seat int;
  next_human_count int;
  min_human_count int;
  threat_tier int := 0;
  declared_threat boolean := false;
  n int := cardinality(p_hand);
  mask int;
  i int;
  rank_no int;
  subset int[];
  remainder int[];
  made jsonb;
  legal boolean;
  best int[] := '{}';
  best_key numeric[];
  candidate_key numeric[];
  kind text;
  strength numeric;
  combo_size int;
  special_cost int;
  finish_cost int;
  rank_groups int;
  isolated_singles int;
  longest_run int;
  current_run int;
  remaining_turns int;
  retained_control int;
  break_cost int;
  response_risk int;
  seen_cards int[] := '{}';
  unseen_above int;
  wish_required boolean := false;
begin
  if n is null or n = 0 then return best; end if;

  select r.game_mode, p.seat
  into room_mode, bot_seat
  from public.tichu_rooms r
  join public.tichu_players p on p.room_id = r.id and p.user_id = p_bot
  where r.id = p_room;

  next_seat := public.tichu_next_seat(p_room, bot_seat);

  select cardinality(h.cards)
  into next_human_count
  from public.tichu_players p
  join public.tichu_hands h using (room_id, user_id)
  where p.room_id = p_room and p.seat = next_seat and not p.is_bot
    and (room_mode = 'INDIVIDUAL' or p.team <> p_bot_team);

  select min(cardinality(h.cards)),
         coalesce(bool_or(p.small_called or p.grand_called), false)
  into min_human_count, declared_threat
  from public.tichu_players p
  join public.tichu_hands h using (room_id, user_id)
  where p.room_id = p_room and p.user_id <> p_bot and not p.is_bot
    and cardinality(h.cards) > 0
    and (room_mode = 'INDIVIDUAL' or p.team <> p_bot_team);

  threat_tier := case
    when declared_threat or coalesce(min_human_count, 99) <= 3 then 3
    when coalesce(min_human_count, 99) <= 5 then 2
    when coalesce(min_human_count, 99) <= 8 then 1
    else 0
  end;

  select coalesce(array_agg(card), '{}') into seen_cards
  from (
    select unnest(p.captured) card
    from public.tichu_players p where p.room_id = p_room
    union all
    select value::int
    from public.tichu_rooms r,
      lateral jsonb_array_elements(r.trick) play,
      lateral jsonb_array_elements_text(play->'cards') value
    where r.id = p_room
  ) public_cards;

  wish_required := p_wish_rank is not null and exists (
    select 1 from unnest(p_hand) card
    where card < 52 and card / 4 + 2 = p_wish_rank
  );

  for mask in 1..(power(2, n)::int - 1) loop
    subset := '{}';
    for i in 1..n loop
      if (mask / power(2, i - 1)::int) % 2 = 1 then
        subset := array_append(subset, p_hand[i]);
      end if;
    end loop;

    if 53 = any(subset) and (p_lead is not null or cardinality(subset) <> 1) then continue; end if;
    if wish_required and not exists (
      select 1 from unnest(subset) card
      where card < 52 and card / 4 + 2 = p_wish_rank
    ) then continue; end if;

    made := public.tichu_classify_cards(subset, p_lead);
    if made is null then continue; end if;

    kind := made->>'kind';
    strength := (made->>'strength')::numeric;
    combo_size := cardinality(subset);

    -- Multiple aces are separate control opportunities. Spend them together
    -- only when doing so ends the bot's hand immediately.
    if combo_size < n and (
      (select count(*) from unnest(subset) card where card between 48 and 51) >= 2
      or (54 = any(subset) and strength = 14
        and kind in ('pair', 'triple', 'full', 'pair-straight'))
    ) then continue; end if;

    legal := p_lead is null or
      ((made->>'bomb')::boolean and not coalesce((p_lead->>'bomb')::boolean, false)) or
      ((made->>'bomb')::boolean and coalesce((p_lead->>'bomb')::boolean, false)
        and ((made->>'size')::int > (p_lead->>'size')::int
          or ((made->>'size')::int = (p_lead->>'size')::int and strength > (p_lead->>'strength')::numeric))) or
      (not coalesce((p_lead->>'bomb')::boolean, false)
        and p_lead->>'kind' = kind and (p_lead->>'size')::int = (made->>'size')::int
        and strength > (p_lead->>'strength')::numeric);
    if not legal then continue; end if;

    remainder := array(
      select card from unnest(p_hand) card where not card = any(subset)
    );
    finish_cost := case when combo_size = n then 0 else 1 end;

    -- Estimate how many future leads remain. Consecutive ordinary ranks and
    -- grouped ranks reduce the estimate; isolated singletons increase it.
    select count(distinct card / 4 + 2) + count(*) filter (where card >= 52)
    into rank_groups from unnest(remainder) card;
    isolated_singles := 0;
    longest_run := 0;
    current_run := 0;
    for rank_no in 2..14 loop
      if exists(select 1 from unnest(remainder) card where card < 52 and card / 4 + 2 = rank_no) then
        current_run := current_run + 1;
        longest_run := greatest(longest_run, current_run);
        if (select count(*) from unnest(remainder) card where card < 52 and card / 4 + 2 = rank_no) = 1
          and not exists(select 1 from unnest(remainder) card where card < 52 and card / 4 + 2 in (rank_no - 1, rank_no + 1))
        then isolated_singles := isolated_singles + 1; end if;
      else current_run := 0;
      end if;
    end loop;
    remaining_turns := greatest(rank_groups - case when longest_run >= 5 then longest_run - 1 else 0 end, 0)
      + isolated_singles;

    retained_control := (select count(*) from unnest(remainder) card where card between 48 and 51)
      + (case when 55 = any(remainder) then 2 else 0 end)
      + (case when 54 = any(remainder) then 1 else 0 end);
    special_cost := (case when 55 = any(subset) then 6 else 0 end)
      + (case when 54 = any(subset) then 3 else 0 end)
      + (case when (made->>'bomb')::boolean then 10 else 0 end);

    break_cost := 0;
    for rank_no in 2..14 loop
      if exists(select 1 from unnest(subset) card where card < 52 and card / 4 + 2 = rank_no)
        and exists(select 1 from unnest(remainder) card where card < 52 and card / 4 + 2 = rank_no)
      then break_cost := break_cost + 2; end if;
    end loop;

    unseen_above := 0;
    if kind = 'single' and subset[1] < 52 then
      select count(*) into unseen_above
      from generate_series(0, 51) card
      where card / 4 + 2 > strength
        and not card = any(seen_cards) and not card = any(p_hand);
    end if;

    response_risk := case
      when next_human_count is null then 1
      when combo_size > next_human_count then 0
      when kind = 'single' then least(unseen_above, 9)
      when strength >= 13 then 1
      when strength >= 11 then 2
      else 4
    end;

    if p_lead is null then
      candidate_key := array[
        finish_cost::numeric,
        (case when threat_tier >= 2 then response_risk else 0 end)::numeric,
        remaining_turns::numeric,
        isolated_singles::numeric,
        special_cost::numeric,
        break_cost::numeric,
        (case when threat_tier >= 2 then -strength else strength end)::numeric,
        -combo_size::numeric,
        -retained_control::numeric
      ];
    else
      candidate_key := array[
        finish_cost::numeric,
        (case when threat_tier = 3 then response_risk else 0 end)::numeric,
        (case when threat_tier = 3 then -strength else strength end)::numeric,
        (case when (made->>'bomb')::boolean and threat_tier < 3 then 1 else 0 end)::numeric,
        remaining_turns::numeric,
        special_cost::numeric,
        break_cost::numeric,
        -combo_size::numeric,
        -retained_control::numeric
      ];
    end if;

    if best_key is null or candidate_key < best_key then best := subset; best_key := candidate_key; end if;
  end loop;

  return best;
end;
$$;

do $$
declare
  fn text;
  old_call text := 'chosen := public.tichu_god_counted_play(p_room, bot.user_id, bot.team, hand_cards, room_row.lead);';
  new_call text := 'chosen := public.tichu_god_counted_play(p_room, bot.user_id, bot.team, hand_cards, room_row.lead, room_row.wish_rank);';
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  if strpos(fn, new_call) = 0 then
    if strpos(fn, old_call) = 0 then raise exception 'God AI chooser call was not found'; end if;
    fn := replace(fn, old_call, new_call);
  end if;
  fn := replace(fn,
    'if bot.bot_difficulty = ''god'' and not wish_legal then',
    'if bot.bot_difficulty = ''god'' then');
  fn := replace(fn,
    'IF bot.bot_difficulty = ''god''::text AND NOT wish_legal THEN',
    'IF bot.bot_difficulty = ''god''::text THEN');
  execute fn;
end;
$$;

drop function if exists public.tichu_god_counted_play(uuid, uuid, int, int[], jsonb);
revoke all on function public.tichu_god_counted_play(uuid, uuid, int, int[], jsonb, int)
  from public, anon, authenticated;

commit;
