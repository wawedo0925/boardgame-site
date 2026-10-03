begin;

alter table public.tichu_rooms
  add column if not exists bot_boost_enabled boolean not null default false;

create or replace function public.tichu_set_bot_boost(
  p_room uuid,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  update public.tichu_rooms
  set bot_boost_enabled = coalesce(p_enabled, false),
      revision = revision + 1,
      updated_at = now()
  where id = p_room
    and host_id = auth.uid()
    and status <> 'FINISHED';

  if not found then
    raise exception '방장만 진행 중인 방의 AI 부스터를 변경할 수 있습니다.';
  end if;
end;
$$;

create or replace function public.tichu_randomize_teams(p_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_row public.tichu_rooms%rowtype;
  player_count int;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into room_row
  from public.tichu_rooms
  where id = p_room
  for update;

  if not found or room_row.host_id <> auth.uid() then
    raise exception '방장만 팀을 무작위로 배정할 수 있습니다.';
  end if;
  if room_row.status <> 'WAITING' then
    raise exception '대기방에서만 팀을 배정할 수 있습니다.';
  end if;

  select count(*) into player_count
  from public.tichu_players
  where room_id = p_room;

  if player_count < 2 then
    raise exception '두 명 이상일 때 팀을 배정할 수 있습니다.';
  end if;

  with shuffled as (
    select user_id, row_number() over (order by random()) as position
    from public.tichu_players
    where room_id = p_room
  )
  update public.tichu_players p
  set team = case when s.position <= ceil(player_count / 2.0) then 0 else 1 end,
      ready = p.is_bot
  from shuffled s
  where p.room_id = p_room
    and p.user_id = s.user_id;

  update public.tichu_rooms
  set revision = revision + 1,
      updated_at = now()
  where id = p_room;
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
  if p_difficulty not in ('beginner', 'intermediate', 'advanced') then
    raise exception '지원하지 않는 AI 난이도입니다.';
  end if;

  select * into room_row from public.tichu_rooms
  where id = p_room for update;
  if room_row.host_id <> auth.uid() or room_row.status <> 'WAITING' then
    raise exception '방장만 대기방에서 AI를 추가할 수 있습니다.';
  end if;
  if (select count(*) from public.tichu_players where room_id = p_room) >= 4 then
    raise exception '빈자리가 없습니다.';
  end if;

  select x into open_seat from generate_series(0, 3) x
  where not exists (
    select 1 from public.tichu_players where room_id = p_room and seat = x
  ) order by x limit 1;

  select case
    when count(*) filter (where team = 0) <= count(*) filter (where team = 1)
      then 0 else 1
  end into bot_team
  from public.tichu_players where room_id = p_room;
  if (select count(*) from public.tichu_players where room_id = p_room and team = bot_team) >= 2 then
    bot_team := 1 - bot_team;
  end if;

  select candidate into bot_label
  from unnest(
    case when open_seat in (0, 2)
      then array['장원영', '아이유', '카리나', '전지현', '제니']
      else array['차은우', '박보검', '변우석', '이병현', '유재석', '지디']
    end
  ) as names(candidate)
  where not exists (
    select 1 from public.tichu_players p
    where p.room_id = p_room and p.is_bot and p.bot_name = candidate
  )
  order by random()
  limit 1;

  insert into public.tichu_players(
    room_id, user_id, seat, team, ready, is_bot, bot_name, bot_difficulty
  ) values (
    p_room, bot_id, open_seat, bot_team, true, true, bot_label, p_difficulty
  );
  update public.tichu_rooms
  set revision = revision + 1, updated_at = now()
  where id = p_room;
  return bot_id;
end;
$$;

revoke all on function public.tichu_set_bot_boost(uuid, boolean) from public, anon;
grant execute on function public.tichu_set_bot_boost(uuid, boolean) to authenticated;

revoke all on function public.tichu_randomize_teams(uuid) from public, anon;
grant execute on function public.tichu_randomize_teams(uuid) to authenticated;

revoke all on function public.tichu_add_bot(uuid, text) from public, anon;
grant execute on function public.tichu_add_bot(uuid, text) to authenticated;

commit;
