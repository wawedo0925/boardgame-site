-- Delete unused boardgames through a privileged, audited database boundary.
-- Historical play/event records are deliberately protected from deletion.

create or replace function public.admin_delete_boardgame(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  game_name text;
  site_role text := public.current_site_role();
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if site_role not in ('MAIN_ADMIN', 'ADMIN', 'RULE_MASTER') then
    raise exception '관리자 또는 룰마만 보드게임을 삭제할 수 있습니다.';
  end if;

  select name into game_name
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception '삭제할 보드게임을 찾을 수 없습니다.';
  end if;

  if exists (select 1 from public.play_record_games where game_id = p_game_id)
     or exists (select 1 from public.event_game_sessions where game_id = p_game_id) then
    raise exception '플레이 또는 이벤트 기록이 연결된 게임은 기록 보호를 위해 삭제할 수 없습니다.';
  end if;

  -- Records that only describe this library item are removed with the game.
  delete from public.game_comments where game_id = p_game_id;
  delete from public.game_reviews where game_id = p_game_id;
  delete from public.game_rule_notes where game_id = p_game_id;
  delete from public.game_organizer_images where game_id = p_game_id;
  delete from public.game_guide_videos where game_id = p_game_id;
  delete from public.game_roles where game_id = p_game_id;
  delete from public.games where id = p_game_id;

exception
  when foreign_key_violation then
    raise exception '다른 기록에서 사용 중인 게임이라 삭제할 수 없습니다. 연결된 기록을 먼저 확인해 주세요.';
end;
$$;

revoke all on function public.admin_delete_boardgame(uuid) from public, anon;
grant execute on function public.admin_delete_boardgame(uuid) to authenticated;
