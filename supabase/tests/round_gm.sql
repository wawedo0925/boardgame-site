-- All changes, including result notifications, are rolled back.
begin;
do $$
declare
  target record;
  saved public.event_round_players%rowtype;
  before_count bigint;
  after_count bigint;
begin
  select p.id, s.game_id into strict target
  from public.event_round_players p
  join public.event_game_rounds r on r.id = p.round_id
  join public.event_game_sessions s on s.id = r.session_id
  where p.score is not null and not p.is_gm
  limit 1;
  select * into saved from public.event_round_players where id = target.id;
  select member_score_count into before_count from public.get_boardgame_score_summary(target.game_id);

  update public.event_round_players set is_gm = true, score = null, rank = null,
    role_name = null, team_name = null, is_winner = null where id = target.id;
  if not exists(select 1 from public.event_round_players where id = target.id and is_gm and score is null and rank is null) then
    raise exception 'GM record did not persist';
  end if;
  select member_score_count into after_count from public.get_boardgame_score_summary(target.game_id);
  if after_count <> before_count - 1 then raise exception 'GM counted as a scored player'; end if;
  begin
    update public.event_round_players set score = 99 where id = target.id;
    raise exception 'GM score was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.event_round_players set rank = 1 where id = target.id;
    raise exception 'GM rank was accepted';
  exception when check_violation then null;
  end;
  update public.event_round_players set is_gm = false, score = saved.score, rank = saved.rank,
    role_name = saved.role_name, team_name = saved.team_name, is_winner = saved.is_winner where id = target.id;
  select member_score_count into after_count from public.get_boardgame_score_summary(target.game_id);
  if after_count <> before_count then raise exception 'Player restore failed'; end if;
end $$;
rollback;
select 'PASS: GM persisted, score/rank rejected, excluded from score statistics, player restored; test rolled back' as result;
