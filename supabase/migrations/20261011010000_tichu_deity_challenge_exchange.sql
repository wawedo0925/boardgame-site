begin;

create or replace function public.tichu_is_deity_challenge(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tichu_rooms r
    where r.id = p_room
      and r.game_mode = 'INDIVIDUAL'
      and r.target_score = 1000
      and (select count(*) from public.tichu_players p
           where p.room_id = r.id and not p.is_bot) = 1
      and (select count(*) from public.tichu_players p
           where p.room_id = r.id and p.is_bot and p.bot_difficulty = 'deity') = 1
      and (select count(*) from public.tichu_players p
           where p.room_id = r.id and p.is_bot and p.bot_difficulty = 'god') = 2
      and (select count(*) from public.tichu_players p where p.room_id = r.id) = 4
  )
$$;

create or replace function public.tichu_hand_has_bomb(p_hand int[])
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  suit_no int;
  rank_no int;
  run_length int;
begin
  if exists (
    select 1 from unnest(p_hand) card
    where card < 52
    group by card / 4 + 2
    having count(*) = 4
  ) then
    return true;
  end if;

  for suit_no in 0..3 loop
    run_length := 0;
    for rank_no in 2..14 loop
      if exists (
        select 1 from unnest(p_hand) card
        where card < 52 and card % 4 = suit_no and card / 4 + 2 = rank_no
      ) then
        run_length := run_length + 1;
        if run_length >= 5 then return true; end if;
      else
        run_length := 0;
      end if;
    end loop;
  end loop;
  return false;
end;
$$;

-- Higher means the human receives a more useful hand. Bombs dominate the
-- score, then triples, then Phoenix-assisted or natural straight potential.
create or replace function public.tichu_human_exchange_risk(p_hand int[])
returns int
language plpgsql
immutable
set search_path = public
as $$
declare
  rank_no int;
  start_rank int;
  scan_rank int;
  triples int := 0;
  pairs int := 0;
  run_length int;
  longest_run int := 0;
  missing int;
  has_phoenix boolean := 54 = any(p_hand);
begin
  if public.tichu_hand_has_bomb(p_hand) then return 1000000000; end if;

  for rank_no in 2..14 loop
    select count(*) into run_length
    from unnest(p_hand) card
    where card < 52 and card / 4 + 2 = rank_no;
    if run_length >= 3 then triples := triples + 1;
    elsif run_length = 2 then pairs := pairs + 1;
    end if;
  end loop;

  -- Mahjong is rank 1; Phoenix may fill at most one missing rank.
  for start_rank in 1..14 loop
    run_length := 0;
    missing := 0;
    for scan_rank in start_rank..14 loop
      if (scan_rank = 1 and 52 = any(p_hand)) or exists (
        select 1 from unnest(p_hand) card
        where card < 52 and card / 4 + 2 = scan_rank
      ) then
        run_length := run_length + 1;
      elsif has_phoenix and missing = 0 then
        missing := 1;
        run_length := run_length + 1;
      else
        exit;
      end if;
      longest_run := greatest(longest_run, run_length);
    end loop;
  end loop;

  return triples * 100000
    + greatest(longest_run - 4, 0) * 5000
    + pairs * 100
    + longest_run * 10;
end;
$$;

do $$
begin
  if not public.tichu_hand_has_bomb(array[0,1,2,3]) then
    raise exception '포카드 폭탄 검증에 실패했습니다.';
  end if;
  if not public.tichu_hand_has_bomb(array[0,4,8,12,16]) then
    raise exception '스트레이트 폭탄 검증에 실패했습니다.';
  end if;
  if public.tichu_hand_has_bomb(array[0,5,10,15,16]) then
    raise exception '일반 스트레이트를 폭탄으로 잘못 판정했습니다.';
  end if;
  if public.tichu_human_exchange_risk(array[0,1,2])
      <= public.tichu_human_exchange_risk(array[0,1,8]) then
    raise exception '트리플 방지 우선순위 검증에 실패했습니다.';
  end if;
end;
$$;

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
  order by
    public.tichu_human_exchange_risk(target_hand || card),
    case when card in (52, 53) then 20 else card / 4 + 2 end,
    card
  limit 1;

  if candidate is null then
    raise exception '플레이어에게 폭탄을 만들지 않는 교환 카드를 찾지 못했습니다.';
  end if;
  return candidate;
end;
$$;

-- The title changes hands only in the full intended challenge: individual
-- 1000 points, one Deity, and exactly two other God bots.
create or replace function public.tichu_crown_deity_champion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  champion text;
begin
  if old.status = 'FINISHED' or new.status <> 'FINISHED'
    or not public.tichu_is_deity_challenge(new.id)
    or new.winner_user_id is null
    or exists (
      select 1 from public.tichu_players
      where room_id = new.id and user_id = new.winner_user_id and is_bot
    )
  then
    return new;
  end if;

  select coalesce(nullif(trim(activity_name), ''), '새로운') || '신'
  into champion
  from public.profiles
  where id = new.winner_user_id;

  update public.tichu_deity_title
  set holder_user_id = new.winner_user_id,
      display_name = champion,
      conquered_at = now()
  where singleton;

  update public.tichu_players
  set bot_name = champion
  where is_bot and bot_difficulty = 'deity';
  return new;
end;
$$;

do $$
declare
  fn text;
  changed text;
begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  changed := fn;

  if strpos(changed, 'tichu_is_deity_challenge(p_room)') = 0 then
    changed := replace(
      changed,
      'if room_row.status=''EXCHANGE'' then',
      E'if room_row.status=''EXCHANGE'' then\n    -- In the full Deity challenge the human exchanges first, so God/Deity\n    -- bots can counter the three cards the human chose to give away.\n    if public.tichu_is_deity_challenge(p_room) and exists (\n      select 1 from public.tichu_players hp\n      where hp.room_id=p_room and not hp.is_bot and not exists (\n        select 1 from public.tichu_exchanges he\n        where he.room_id=p_room and he.user_id=hp.user_id\n          and (select count(*) from jsonb_object_keys(he.gifts))=3\n      )\n    ) then return; end if;'
    );
  end if;

  if strpos(changed, 'tichu_deity_exchange_gift') = 0 then
    changed := replace(
      changed,
      'for target in select * from tichu_players where room_id=p_room and user_id<>bot.user_id order by seat loop',
      'for target in select * from tichu_players where room_id=p_room and user_id<>bot.user_id order by case when public.tichu_is_deity_challenge(p_room) and not is_bot then 0 else 1 end,seat loop'
    );
    changed := regexp_replace(
      changed,
      'c\s+limit\s+1;\s*chosen:=array_append\(chosen,gift_card\);',
      E'c limit 1;\n        if public.tichu_is_deity_challenge(p_room) and not target.is_bot\n          and bot.bot_difficulty in (''god'',''deity'') then\n          gift_card:=public.tichu_deity_exchange_gift(\n            p_room,bot.user_id,target.user_id,hand_cards,chosen\n          );\n        end if;\n        chosen:=array_append(chosen,gift_card);'
    );
  end if;

  if changed = fn
    or strpos(changed, 'tichu_is_deity_challenge(p_room)') = 0
    or strpos(changed, 'tichu_deity_exchange_gift') = 0
    or strpos(changed, 'and not is_bot then 0 else 1 end') = 0
  then
    raise exception '티츄신 도전 교환 로직 삽입 지점을 찾지 못했습니다.';
  end if;
  execute changed;
end;
$$;

revoke all on function public.tichu_is_deity_challenge(uuid),
  public.tichu_hand_has_bomb(int[]),
  public.tichu_human_exchange_risk(int[]),
  public.tichu_deity_exchange_gift(uuid,uuid,uuid,int[],int[])
from public, anon, authenticated;

commit;
