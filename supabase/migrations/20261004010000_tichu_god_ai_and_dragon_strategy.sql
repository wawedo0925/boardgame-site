begin;

alter table public.tichu_players
  drop constraint if exists tichu_players_bot_difficulty_check;
alter table public.tichu_players
  add constraint tichu_players_bot_difficulty_check
  check (bot_difficulty in ('beginner', 'intermediate', 'advanced', 'god'));

-- God AI examines every legal subset and favors shedding more cards while
-- conserving bombs and high-value special cards whenever a cheaper play works.
create or replace function public.tichu_god_best_play(p_hand int[], p_lead jsonb)
returns int[]
language plpgsql
immutable
set search_path = public
as $$
declare
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
begin
  if n is null or n = 0 then return best; end if;

  for mask in 1..(power(2, n)::int - 1) loop
    subset := '{}';
    for i in 1..n loop
      if (mask / power(2, i - 1)::int) % 2 = 1 then
        subset := array_append(subset, p_hand[i]);
      end if;
    end loop;

    -- Dog is only legal as a single-card lead.
    if 53 = any(subset) and (p_lead is not null or cardinality(subset) <> 1) then
      continue;
    end if;

    made := public.tichu_classify_cards(subset, p_lead);
    if made is null then continue; end if;

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

    if p_lead is null then
      candidate_key := array[
        special_cost::numeric,
        -cardinality(subset)::numeric,
        (made->>'strength')::numeric
      ];
    else
      candidate_key := array[
        (case when (made->>'bomb')::boolean and not coalesce((p_lead->>'bomb')::boolean, false) then 1 else 0 end)::numeric,
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

-- Extend the current bot engine without replacing later hotfixes made to it.
do $$
declare
  fn text;
  marker text := '-- tichu teammate support policy: all AI levels protect a teammate''s call.';
  god_logic text := E'  -- God AI searches all legal combinations before the regular fallback logic.\n  if bot.bot_difficulty = ''god'' and not wish_legal then\n    chosen := public.tichu_god_best_play(hand_cards, room_row.lead);\n    if cardinality(chosen) > 0 then\n      play_cards := chosen;\n      wish_combo := public.tichu_classify_cards(play_cards, room_row.lead);\n      play_kind := wish_combo->>''kind'';\n      play_size := (wish_combo->>''size'')::int;\n      play_strength := (wish_combo->>''strength'')::numeric;\n      play_bomb := (wish_combo->>''bomb'')::boolean;\n    end if;\n  end if;\n\n  ';
  old_dragon text := 'order by cardinality(oh.cards), opp.seat limit 1';
  new_dragon text := 'order by (opp.grand_called or opp.small_called), cardinality(oh.cards) desc, opp.seat limit 1';
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;

  if strpos(fn, 'God AI searches all legal combinations') = 0 then
    if strpos(fn, marker) = 0 then
      raise exception 'Tichu bot strategy insertion point not found';
    end if;
    fn := replace(fn, marker, god_logic || marker);
  end if;

  -- God keeps all of Advanced AI's declaration, exchange, teammate-support,
  -- and bomb policies; its exhaustive chooser below is the extra layer.
  fn := replace(
    fn,
    'bot.bot_difficulty = ''advanced''::text',
    'bot.bot_difficulty = ANY (ARRAY[''advanced''::text, ''god''::text])'
  );
  fn := replace(
    fn,
    'bot.bot_difficulty = ''advanced''',
    'bot.bot_difficulty in (''advanced'', ''god'')'
  );

  if strpos(fn, old_dragon) = 0 then
    raise exception 'Tichu bot Dragon ordering was not found';
  end if;
  fn := replace(fn, old_dragon, new_dragon);
  execute fn;
end;
$$;

create or replace function public.tichu_add_bot(
  p_room uuid,
  p_difficulty text default 'beginner'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.tichu_rooms%rowtype;
  bot_id uuid := gen_random_uuid();
  open_seat int;
  bot_team int;
  bot_label text;
begin
  if p_difficulty not in ('beginner', 'intermediate', 'advanced', 'god') then
    raise exception '지원하지 않는 AI 난이도입니다.';
  end if;

  select * into room_row from public.tichu_rooms where id = p_room for update;
  if room_row.host_id <> auth.uid() or room_row.status <> 'WAITING' then
    raise exception '방장만 대기방에서 AI를 추가할 수 있습니다.';
  end if;
  if (select count(*) from public.tichu_players where room_id = p_room) >= 4 then
    raise exception '빈자리가 없습니다.';
  end if;

  select x into open_seat from generate_series(0, 3) x
  where not exists (select 1 from public.tichu_players where room_id = p_room and seat = x)
  order by x limit 1;

  select case when count(*) filter (where team = 0) <= count(*) filter (where team = 1)
    then 0 else 1 end into bot_team
  from public.tichu_players where room_id = p_room;
  if (select count(*) from public.tichu_players where room_id = p_room and team = bot_team) >= 2 then
    bot_team := 1 - bot_team;
  end if;

  select candidate into bot_label
  from unnest(case when open_seat in (0, 2)
    then array['장원영', '아이유', '카리나', '전지현', '제니']
    else array['차은우', '박보검', '변우석', '이병현', '유재석', '지디'] end) names(candidate)
  where not exists (
    select 1 from public.tichu_players p
    where p.room_id = p_room and p.is_bot and p.bot_name = candidate
  )
  order by random() limit 1;

  insert into public.tichu_players(
    room_id, user_id, seat, team, ready, is_bot, bot_name, bot_difficulty
  ) values (p_room, bot_id, open_seat, bot_team, true, true, bot_label, p_difficulty);
  update public.tichu_rooms set revision = revision + 1, updated_at = now() where id = p_room;
  return bot_id;
end;
$$;

revoke all on function public.tichu_god_best_play(int[], jsonb) from public, anon, authenticated;
revoke all on function public.tichu_add_bot(uuid, text) from public, anon;
grant execute on function public.tichu_add_bot(uuid, text) to authenticated;

commit;
