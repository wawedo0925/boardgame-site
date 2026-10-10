begin;

-- A Deity challenge always uses the same clockwise table order from the
-- human's point of view: human (6), Deity (9), God AI (12), God AI (3).
create or replace function public.tichu_normalize_deity_seats(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tichu_players
    where room_id = p_room and is_bot and bot_difficulty = 'deity'
  ) then
    return;
  end if;

  with desired as (
    select user_id, 0 as desired_seat
    from public.tichu_players
    where room_id = p_room and not is_bot
    order by seat
    limit 1
  ), deity as (
    select user_id, 1 as desired_seat
    from public.tichu_players
    where room_id = p_room and is_bot and bot_difficulty = 'deity'
    limit 1
  ), other_bots as (
    select user_id, 1 + row_number() over (order by seat, user_id)::int as desired_seat
    from public.tichu_players
    where room_id = p_room and is_bot and bot_difficulty <> 'deity'
  ), seats as (
    select * from desired
    union all select * from deity
    union all select * from other_bots
  )
  update public.tichu_players p
  set seat = s.desired_seat,
      bot_difficulty = case
        when p.is_bot and p.bot_difficulty <> 'deity' then 'god'
        else p.bot_difficulty
      end
  from seats s
  where p.room_id = p_room and p.user_id = s.user_id
    and (p.seat <> s.desired_seat
      or (p.is_bot and p.bot_difficulty not in ('god', 'deity')));
end;
$$;

-- AI special cards never target the human in an individual Deity challenge.
-- Ordinary bots prefer the Deity; the Deity gives Dog to the next active bot.
create or replace function public.tichu_ai_dog_target(p_room uuid, p_bot uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bot_row public.tichu_players%rowtype;
  target_seat int;
begin
  select * into bot_row from public.tichu_players
  where room_id = p_room and user_id = p_bot;

  if bot_row.bot_difficulty <> 'deity' then
    select p.seat into target_seat
    from public.tichu_players p
    join public.tichu_hands h using (room_id, user_id)
    where p.room_id = p_room and p.is_bot and p.bot_difficulty = 'deity'
      and p.user_id <> p_bot and cardinality(h.cards) > 0
    limit 1;
    if target_seat is not null then return target_seat; end if;
  end if;

  select p.seat into target_seat
  from public.tichu_players p
  join public.tichu_hands h using (room_id, user_id)
  where p.room_id = p_room and p.is_bot and p.user_id <> p_bot
    and cardinality(h.cards) > 0
  order by ((p.seat - bot_row.seat + 4) % 4)
  limit 1;
  return target_seat;
end;
$$;

create or replace function public.tichu_ai_dragon_target(p_room uuid, p_bot uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  bot_row public.tichu_players%rowtype;
  target_id uuid;
begin
  select * into bot_row from public.tichu_players
  where room_id = p_room and user_id = p_bot;

  if bot_row.bot_difficulty <> 'deity' then
    select user_id into target_id
    from public.tichu_players
    where room_id = p_room and is_bot and bot_difficulty = 'deity'
      and user_id <> p_bot
    limit 1;
    if target_id is not null then return target_id; end if;
  end if;

  select p.user_id into target_id
  from public.tichu_players p
  left join public.tichu_hands h using (room_id, user_id)
  where p.room_id = p_room and p.is_bot and p.user_id <> p_bot
  order by (cardinality(h.cards) > 0) desc,
           ((p.seat - bot_row.seat + 4) % 4)
  limit 1;
  return target_id;
end;
$$;

-- The accumulated bot engine already calls this function for every God/Deity
-- Dog play. Replacing the helper is safer than rewriting the full engine.
create or replace function public.tichu_strategic_dog_target(p_room uuid, p_bot uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select public.tichu_ai_dog_target(p_room, p_bot)
$$;

-- Bot Dragon targeting is corrected at the room update boundary. Human Dragon
-- choices are untouched because the last trick player is not a bot.
create or replace function public.tichu_enforce_ai_dragon_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.tichu_players%rowtype;
begin
  if new.game_mode <> 'INDIVIDUAL' or new.dragon_target is null
    or new.last_trick_seat is null
  then
    return new;
  end if;

  select * into actor from public.tichu_players
  where room_id = new.id and seat = new.last_trick_seat and is_bot;
  if found and exists (
    select 1
    from jsonb_array_elements(coalesce(new.trick, '[]'::jsonb)) entry
    cross join lateral jsonb_array_elements_text(entry->'cards') card
    where card::int = 55
  ) then
    new.dragon_target := public.tichu_ai_dragon_target(new.id, actor.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists tichu_enforce_ai_dragon_target_trigger on public.tichu_rooms;
create trigger tichu_enforce_ai_dragon_target_trigger
before update of dragon_target on public.tichu_rooms
for each row execute function public.tichu_enforce_ai_dragon_target();

-- Fix the human opening distribution as three exclusive buckets. Only the
-- 20% power bucket may contain one A/Phoenix/Dragon; both King buckets contain
-- none of those cards.
do $$
declare
  fn text;
  changed text;
begin
  select pg_get_functiondef('public.tichu_prepare_deity_opening()'::regprocedure) into fn;
  changed := regexp_replace(
    fn,
    'if\s+bucket\s*=\s*''power_one''\s+and\s+\(select\s+count\(\*\)\s+from\s+unnest\(opening\)\s+card\s+where\s+card\s+between\s+48\s+and\s+51\s+or\s+card\s+in\s*\(54,\s*55\)\)\s*>\s*1\s+then',
    E'if (select count(*) from unnest(opening) card where card between 48 and 51 or card in (54, 55)) >\n          (case when bucket = ''power_one'' then 1 else 0 end)\n        then',
    'i'
  );
  if changed = fn then raise exception '티츄신 최초 8장 특수카드 제한을 찾지 못했습니다.'; end if;
  execute changed;

  select pg_get_functiondef('public.tichu_apply_god_opening_handicap()'::regprocedure) into fn;
  changed := regexp_replace(
    fn,
    'if\s+new\.deity_human_bonus\s*=\s*''power_one''\s+and\s+\(select\s+count\(\*\)\s+from\s+unnest\(candidate\)\s+card\s+where\s+card\s+between\s+48\s+and\s+51\s+or\s+card\s+in\s*\(54,\s*55\)\)\s*<>\s*1\s+then',
    E'if (select count(*) from unnest(candidate) card where card between 48 and 51 or card in (54, 55)) <>\n          (case when new.deity_human_bonus = ''power_one'' then 1 else 0 end)\n        then',
    'i'
  );
  if changed = fn then raise exception '티츄신 최종 14장 특수카드 제한을 찾지 못했습니다.'; end if;
  execute changed;
end;
$$;

-- Recreate add-bot with seat normalization while preserving current labels,
-- readiness, and the one-Deity restriction.
create or replace function public.tichu_add_bot(p_room uuid,p_difficulty text default 'beginner') returns uuid
language plpgsql security definer set search_path=public as $$
declare room_row public.tichu_rooms%rowtype; bot_id uuid:=gen_random_uuid(); open_seat int; bot_team int; bot_label text;
begin
  if p_difficulty not in('beginner','intermediate','advanced','god','deity') then raise exception '지원하지 않는 AI 난이도입니다.'; end if;
  select * into room_row from public.tichu_rooms where id=p_room for update;
  if room_row.host_id<>auth.uid() or room_row.status<>'WAITING' then raise exception '방장만 대기방에서 AI를 추가할 수 있습니다.'; end if;
  if (select count(*) from public.tichu_players where room_id=p_room)>=4 then raise exception '빈자리가 없습니다.'; end if;
  if p_difficulty='deity' then
    if room_row.game_mode<>'INDIVIDUAL' then raise exception '티츄신은 개인전에만 참가할 수 있습니다.'; end if;
    if exists(select 1 from public.tichu_players where room_id=p_room and bot_difficulty='deity') then raise exception '티츄신은 한 명만 추가할 수 있습니다.'; end if;
    select display_name into bot_label from public.tichu_deity_title where singleton;
  end if;
  select x into open_seat from generate_series(0,3)x where not exists(select 1 from public.tichu_players where room_id=p_room and seat=x) order by x limit 1;
  select case when count(*) filter(where team=0)<=count(*) filter(where team=1) then 0 else 1 end into bot_team from public.tichu_players where room_id=p_room;
  if (select count(*) from public.tichu_players where room_id=p_room and team=bot_team)>=2 then bot_team:=1-bot_team; end if;
  if p_difficulty<>'deity' then
    select candidate into bot_label from unnest(case when open_seat in(0,2)
      then array['장원영','아이유','카리나','전지현','제니'] else array['차은우','박보검','변우석','이병현','유재석','지디'] end)names(candidate)
    where not exists(select 1 from public.tichu_players p where p.room_id=p_room and p.is_bot and p.bot_name=candidate)
    order by random() limit 1;
  end if;
  insert into public.tichu_players(room_id,user_id,seat,team,ready,is_bot,bot_name,bot_difficulty)
  values(p_room,bot_id,open_seat,bot_team,true,true,bot_label,p_difficulty);
  if room_row.game_mode='INDIVIDUAL' then perform public.tichu_normalize_deity_seats(p_room); end if;
  update public.tichu_rooms set revision=revision+1,updated_at=now() where id=p_room;
  return bot_id;
end;
$$;

revoke all on function public.tichu_normalize_deity_seats(uuid) from public, anon, authenticated;
revoke all on function public.tichu_ai_dog_target(uuid,uuid) from public, anon, authenticated;
revoke all on function public.tichu_ai_dragon_target(uuid,uuid) from public, anon, authenticated;
revoke all on function public.tichu_enforce_ai_dragon_target() from public, anon, authenticated;
revoke all on function public.tichu_add_bot(uuid,text) from public,anon;
grant execute on function public.tichu_add_bot(uuid,text) to authenticated;

commit;
