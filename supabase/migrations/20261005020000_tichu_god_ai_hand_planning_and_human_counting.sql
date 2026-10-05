begin;

create or replace function public.tichu_god_counted_play(
  p_room uuid,
  p_bot uuid,
  p_bot_team int,
  p_hand int[],
  p_lead jsonb
) returns int[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  room_mode text;
  n int := cardinality(p_hand);
  mask int;
  i int;
  subset int[];
  made jsonb;
  legal boolean;
  best int[] := '{}';
  best_key numeric[];
  candidate_key numeric[];
  special_cost int;
  structure_cost int;
  finish_cost int;
  human_threat boolean := false;
  human_led boolean := false;
  lead_seat int;
  single_rank int;
begin
  if n is null or n = 0 then return best; end if;

  select game_mode, last_trick_seat into room_mode, lead_seat
  from public.tichu_rooms where id = p_room;

  select exists (
    select 1
    from public.tichu_players opponent
    join public.tichu_hands oh using (room_id, user_id)
    where opponent.room_id = p_room
      and opponent.user_id <> p_bot
      and not opponent.is_bot
      and cardinality(oh.cards) > 0
      and (room_mode = 'INDIVIDUAL' or opponent.team <> p_bot_team)
      and (cardinality(oh.cards) <= 3 or opponent.small_called or opponent.grand_called)
  ) into human_threat;

  if lead_seat is not null then
    select exists (
      select 1 from public.tichu_players leader
      where leader.room_id = p_room and leader.seat = lead_seat
        and not leader.is_bot
        and (room_mode = 'INDIVIDUAL' or leader.team <> p_bot_team)
    ) into human_led;
  end if;

  for mask in 1..(power(2, n)::int - 1) loop
    subset := '{}';
    for i in 1..n loop
      if (mask / power(2, i - 1)::int) % 2 = 1 then
        subset := array_append(subset, p_hand[i]);
      end if;
    end loop;

    if 53 = any(subset) and (p_lead is not null or cardinality(subset) <> 1) then
      continue;
    end if;

    made := public.tichu_classify_cards(subset, p_lead);
    if made is null then continue; end if;

    -- Keep multiple A cards as separate lead-taking opportunities. Do not use
    -- AA/AAA/AAAA (including a Phoenix completing an A set) unless that play
    -- empties the bot's entire hand. A normal straight containing one A is OK.
    if cardinality(subset) < n and (
      (select count(*) from unnest(subset) card where card between 48 and 51) >= 2
      or (
        54 = any(subset)
        and (made->>'strength')::numeric = 14
        and made->>'kind' in ('pair', 'triple', 'full', 'pair-straight')
      )
    ) then
      continue;
    end if;

    legal := p_lead is null or
      ((made->>'bomb')::boolean and not coalesce((p_lead->>'bomb')::boolean, false)) or
      ((made->>'bomb')::boolean and coalesce((p_lead->>'bomb')::boolean, false)
        and ((made->>'size')::int > (p_lead->>'size')::int
          or ((made->>'size')::int = (p_lead->>'size')::int
            and (made->>'strength')::numeric > (p_lead->>'strength')::numeric))) or
      (not coalesce((p_lead->>'bomb')::boolean, false)
        and p_lead->>'kind' = made->>'kind'
        and (p_lead->>'size')::int = (made->>'size')::int
        and (made->>'strength')::numeric > (p_lead->>'strength')::numeric);
    if not legal then continue; end if;

    special_cost := (case when 55 = any(subset) then 4 else 0 end)
      + (case when 54 = any(subset) then 2 else 0 end)
      + (case when (made->>'bomb')::boolean then 8 else 0 end);
    finish_cost := case when cardinality(subset) = n then 0 else 1 end;

    if p_lead is null and human_threat then
      -- A threatened human is blocked with the strongest ordinary single.
      -- Finishing the whole hand still takes priority.
      candidate_key := array[
        finish_cost::numeric,
        (case when made->>'kind' = 'single' then 0 else 1 end)::numeric,
        special_cost::numeric,
        -(made->>'strength')::numeric,
        -cardinality(subset)::numeric
      ];
    elsif p_lead is null and n > 7 then
      -- Early game: shed genuine low singletons first and preserve pairs,
      -- triples, full houses, and long straights for later.
      structure_cost := 1;
      if made->>'kind' = 'single' then
        if subset[1] < 52 then
          single_rank := subset[1] / 4 + 2;
          structure_cost := case when (
            select count(*) from unnest(p_hand) card
            where card < 52 and card / 4 + 2 = single_rank
          ) = 1 then 0 else 3 end;
        else
          structure_cost := 4;
        end if;
      elsif made->>'kind' in ('straight', 'straight-bomb', 'full', 'pair-straight') then
        structure_cost := 2;
      end if;

      candidate_key := array[
        finish_cost::numeric,
        special_cost::numeric,
        structure_cost::numeric,
        (made->>'strength')::numeric,
        -cardinality(subset)::numeric
      ];
    elsif p_lead is null then
      -- Late game: reduce the number of remaining turns aggressively.
      candidate_key := array[
        finish_cost::numeric,
        special_cost::numeric,
        -cardinality(subset)::numeric,
        (made->>'strength')::numeric
      ];
    else
      -- On a human opponent's lead, finishing and taking control outrank card
      -- conservation. Against other AIs, retain the normal economical reply.
      candidate_key := array[
        finish_cost::numeric,
        (case when (made->>'bomb')::boolean and not coalesce((p_lead->>'bomb')::boolean, false)
          then case when human_led and human_threat then 0 else 1 end else 0 end)::numeric,
        special_cost::numeric,
        (made->>'strength')::numeric,
        -cardinality(subset)::numeric
      ];
    end if;

    if best_key is null or candidate_key < best_key then
      best := subset;
      best_key := candidate_key;
    end if;
  end loop;

  return best;
end;
$$;

do $$
declare
  fn text;
  old_call text := 'chosen := public.tichu_god_best_play(hand_cards, room_row.lead);';
  new_call text := 'chosen := public.tichu_god_counted_play(p_room, bot.user_id, bot.team, hand_cards, room_row.lead);';
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  if strpos(fn, new_call) = 0 then
    if strpos(fn, old_call) = 0 then
      raise exception 'God AI play-selection call was not found';
    end if;
    fn := replace(fn, old_call, new_call);
    execute fn;
  end if;
end;
$$;

revoke all on function public.tichu_god_counted_play(uuid, uuid, int, int[], jsonb)
  from public, anon, authenticated;

commit;
