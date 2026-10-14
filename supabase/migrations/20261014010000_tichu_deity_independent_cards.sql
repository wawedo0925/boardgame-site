begin;

-- Keep the six unrevealed cards private, not in tichu_rooms/snapshot JSON.
create table public.tichu_deity_pending_deals (
  room_id uuid primary key references public.tichu_rooms(id) on delete cascade,
  hands jsonb not null
);
alter table public.tichu_deity_pending_deals enable row level security;
revoke all on public.tichu_deity_pending_deals from public, anon, authenticated;

-- Independent draws: A 0/1/2 = 60/30/10%; Phoenix/Dragon = 5% each.
-- Retain the old K buckets: 20% unrestricted, 30% pair, 50% single.
create function public.tichu_deity_card_targets(a double precision, s double precision, k double precision)
returns int[] language sql immutable set search_path = public as $$
  select array[
    case when a < 0.30 then 1 when a < 0.40 then 2 else 0 end,
    case when s < 0.05 then 54 when s < 0.10 then 55 else 0 end,
    case when k < 0.20 then -1 when k < 0.50 then 2 else 1 end
  ];
$$;

-- Build a feasible full deal before revealing eight cards. Do not reroll the
-- probability targets while rejecting hands (which would bias their odds).
create function public.tichu_make_deity_deal(p_room uuid, p_aces int, p_special int, p_kings int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  human_id uuid;
  deity_id uuid;
  human int[];
  boss int[];
  rest int[];
  picked int[];
  candidate int[];
  result jsonb;
  player_row record;
  valid boolean;
begin
  if p_aces not between 0 and 2 or p_special not in (0,54,55) or p_kings not in (-1,1,2) then
    raise exception 'Invalid deity card targets';
  end if;
  select user_id into human_id from tichu_players where room_id=p_room and not is_bot
    order by (user_id=(select host_id from tichu_rooms where id=p_room)) desc,seat limit 1;
  select user_id into deity_id from tichu_players where room_id=p_room and is_bot and bot_difficulty='deity' limit 1;
  if human_id is null or deity_id is null then raise exception 'Missing deity challenge players'; end if;
  for attempt in 1..20000 loop
    select coalesce(array_agg(card),'{}') into human
      from (select card from generate_series(48,51) card order by random() limit p_aces) chosen;
    if p_special <> 0 then human:=array_append(human,p_special); end if;
    if p_kings <> -1 then
      select array_agg(card) into picked from (select card from generate_series(44,47) card order by random() limit p_kings) chosen;
      human:=human||picked;
    end if;
    select array_agg(card) into picked from (
      select card from generate_series(0,53) card
      where card not between 48 and 51 and (p_kings=-1 or card not between 44 and 47)
        and not card=any(human)
      order by random() limit (14-cardinality(human))
    ) chosen;
    human:=human||picked;
    if tichu_hand_has_bomb(human) or tichu_hand_has_straight(human)
      or (select count(*) from unnest(human) card where card between 44 and 47)>2 then continue; end if;

    select array_agg(card) into boss from (
      select card from generate_series(48,51) card where not card=any(human) order by random() limit 1
    ) chosen;
    select array_agg(card) into picked from (
      select card from generate_series(44,47) card where not card=any(human) order by random() limit 2
    ) chosen;
    boss:=boss||picked;
    select array_agg(card) into picked from (
      select card from generate_series(0,55) card where not card=any(human||boss)
      order by random() limit 11
    ) chosen;
    boss:=boss||picked;
    select array_agg(card order by random()) into rest from generate_series(0,55) card where not card=any(human||boss);
    result:='{}'; valid:=true;
    for player_row in select * from tichu_players where room_id=p_room order by seat loop
      if player_row.user_id=human_id then candidate:=human;
      elsif player_row.user_id=deity_id then candidate:=boss;
      else candidate:=rest[1:14]; rest:=rest[15:cardinality(rest)]; end if;
      if cardinality(candidate)<>14 or (player_row.is_bot and
        (select count(*) from unnest(candidate) card where tichu_bot_safe_opponent_gift(card))<3)
        or (not player_row.is_bot and player_row.user_id<>human_id and not tichu_god_safe_hand(candidate)) then
        valid:=false; exit;
      end if;
      if player_row.user_id=deity_id then
        -- Guarantee at least one A and two Ks among the first eight too.
        select array_agg(card) into picked from (select card from unnest(candidate) card where card between 48 and 51 limit 1) chosen;
        picked:=picked||(select array_agg(card) from (select card from unnest(candidate) card where card between 44 and 47 limit 2) chosen);
        select array_agg(card order by random()) into candidate from unnest(candidate) card where not card=any(picked);
        candidate:=picked||candidate;
      else
        select array_agg(card order by random()) into candidate from unnest(candidate) card;
      end if;
      result:=jsonb_set(result,array[player_row.user_id::text],to_jsonb(candidate));
    end loop;
    if valid then return result; end if;
  end loop;
  raise exception '티츄신 카드 배분을 만들지 못했습니다. 다시 시작해 주세요.';
end;
$$;

create or replace function public.tichu_prepare_deity_opening()
returns trigger language plpgsql security definer set search_path=public as $$
declare targets int[]; deal jsonb; player_row record; opening int[];
begin
  if new.status<>'GRAND' or old.status not in ('WAITING','ROUND_END') then return new; end if;
  if not exists(select 1 from tichu_players where room_id=new.id and is_bot and bot_difficulty='deity') then
    new.deity_human_bonus:=null; return new;
  end if;
  targets:=tichu_deity_card_targets(random(),random(),random());
  deal:=tichu_make_deity_deal(new.id,targets[1],targets[2],targets[3]);
  new.deity_human_bonus:=null;
  insert into tichu_deity_pending_deals(room_id,hands) values(new.id,deal)
    on conflict(room_id) do update set hands=excluded.hands;
  for player_row in select user_id from tichu_players where room_id=new.id loop
    select array_agg(value::int order by value::int) into opening
      from jsonb_array_elements_text(deal->player_row.user_id::text) with ordinality items(value,n) where n<=8;
    update tichu_hands set cards=opening,initial_cards=opening where room_id=new.id and user_id=player_row.user_id;
  end loop;
  return new;
end;
$$;

create function public.tichu_apply_pending_deity_deal(p_room uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare deal jsonb; hand_row record; full_hand int[];
begin
  select hands into deal from tichu_deity_pending_deals where room_id=p_room;
  if deal is null then return false; end if;
  for hand_row in select * from tichu_hands where room_id=p_room loop
    select array_agg(value::int order by value::int) into full_hand from jsonb_array_elements_text(deal->hand_row.user_id::text);
    if cardinality(full_hand) is distinct from 14 or not hand_row.initial_cards <@ full_hand then
      raise exception '티츄신 최초 카드와 예약 배분이 일치하지 않습니다.';
    end if;
    update tichu_hands set cards=full_hand where room_id=p_room and user_id=hand_row.user_id;
  end loop;
  delete from tichu_deity_pending_deals where room_id=p_room;
  return true;
end;
$$;

-- Existing GRAND rooms use the legacy path; new rounds use the private deal.
do $$
declare fn text; changed text;
begin
  select pg_get_functiondef('public.tichu_apply_god_opening_handicap()'::regprocedure) into fn;
  changed:=replace(fn, 'if old.status <> ''GRAND''', E'if old.status = ''GRAND'' and new.status = ''EXCHANGE'' then\n    if public.tichu_apply_pending_deity_deal(new.id) then return new; end if;\n  end if;\n  if old.status <> ''GRAND''');
  if changed=fn then raise exception 'Deity deal hook not found'; end if;
  execute changed;
end;
$$;

revoke all on function public.tichu_deity_card_targets(double precision,double precision,double precision) from public,anon,authenticated;
revoke all on function public.tichu_make_deity_deal(uuid,int,int,int) from public,anon,authenticated;
revoke all on function public.tichu_apply_pending_deity_deal(uuid) from public,anon,authenticated;
revoke all on function public.tichu_prepare_deity_opening() from public,anon,authenticated;

-- Reset the current display name, retaining the existing champion history/rules.
update public.tichu_deity_title set display_name='티츄신' where singleton;
update public.tichu_players set bot_name='티츄신' where is_bot and bot_difficulty='deity';

commit;
