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
      then array['장원영', '아이유', '카리나']
      else array['차은우', '박보검', '변우석']
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

-- 이미 만들어진 방도 AI 번호 대신 이름으로 표시한다.
update public.tichu_players
set bot_name = case seat
  when 0 then '장원영'
  when 1 then '차은우'
  when 2 then '카리나'
  else '변우석'
end
where is_bot;
