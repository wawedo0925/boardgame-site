alter table public.event_participants
  add column if not exists game_preference text,
  add column if not exists game_preference_updated_at timestamptz;

alter table public.event_participants
  drop constraint if exists event_participants_game_preference_check;

alter table public.event_participants
  add constraint event_participants_game_preference_check
  check (
    game_preference is null
    or game_preference in ('PARTY', 'NON_PARTY', 'ANY', 'PREMADE_PARTY')
  );

create or replace function public.set_boardgame_event_preference(
  p_event_id uuid,
  p_preference text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.events%rowtype;
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_preference not in ('PARTY', 'NON_PARTY', 'ANY', 'PREMADE_PARTY') then
    raise exception '유효하지 않은 게임 취향입니다.';
  end if;

  select * into target
  from public.events
  where id = p_event_id;

  if not found then
    raise exception '이벤트를 찾을 수 없습니다.';
  end if;

  if target.event_kind <> 'BOARDGAME' then
    raise exception '보드게임 이벤트에서만 게임 취향을 선택할 수 있습니다.';
  end if;

  if target.event_status <> 'OPEN' then
    raise exception '진행 가능한 이벤트가 아닙니다.';
  end if;

  if now() >= target.started_at - interval '1 hour' then
    raise exception '게임 취향은 이벤트 시작 1시간 전까지만 변경할 수 있습니다.';
  end if;

  update public.event_participants
  set game_preference = p_preference,
      game_preference_updated_at = now()
  where event_id = p_event_id
    and user_id = actor;

  if not found then
    raise exception '이벤트에 참가한 멤버만 게임 취향을 선택할 수 있습니다.';
  end if;
end;
$$;

revoke all on function public.set_boardgame_event_preference(uuid, text) from public, anon;
grant execute on function public.set_boardgame_event_preference(uuid, text) to authenticated;
