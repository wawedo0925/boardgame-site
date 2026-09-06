-- Expose anonymized game score statistics and caller-only personal statistics.
-- Raw player identities and individual scores never leave this database boundary.
create or replace function public.get_boardgame_score_summary(p_game_id uuid)
returns table (
  member_high_score numeric,
  member_average_score numeric,
  member_score_count bigint,
  my_high_score numeric,
  my_average_score numeric,
  my_score_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with scored_plays as (
    select
      player.user_id,
      player.score::numeric as score
    from public.event_round_players player
    join public.event_game_rounds round_record
      on round_record.id = player.round_id
    join public.event_game_sessions game_session
      on game_session.id = round_record.session_id
    where game_session.game_id = p_game_id
      and player.score is not null
  )
  select
    max(score) as member_high_score,
    round(avg(score), 1) as member_average_score,
    count(*) as member_score_count,
    max(score) filter (where user_id = auth.uid()) as my_high_score,
    round(avg(score) filter (where user_id = auth.uid()), 1) as my_average_score,
    count(*) filter (where user_id = auth.uid()) as my_score_count
  from scored_plays;
$$;

revoke all on function public.get_boardgame_score_summary(uuid) from public;
grant execute on function public.get_boardgame_score_summary(uuid) to anon, authenticated;

comment on function public.get_boardgame_score_summary(uuid) is
  'Returns anonymous overall score stats and score stats belonging only to auth.uid().';
