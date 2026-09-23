begin;
create or replace function public.get_game_result_statistics(p_game_ids uuid[])
returns table(game_id uuid, average_score numeric, high_score numeric, score_count bigint, good_rate numeric, evil_rate numeric, role_count bigint, success_rate numeric, coop_count bigint)
language sql stable security definer set search_path=public as $$
with players as (
 select s.game_id, r.id round_id, p.score, p.is_winner, p.team_name,
 case when p.team_name in ('선의 세력','리버럴','쥐 팀','수사 팀','시민 팀') or p.team_name like '% · 선' then 'good'
 when p.team_name in ('악의 세력','파시스트','치즈 도둑 팀','살인범 팀','늑대인간 팀','마녀 팀') or p.team_name like '% · 악' then 'evil' end faction
 from public.event_round_players p
 join public.event_game_rounds r on r.id=p.round_id
 join public.event_game_sessions s on s.id=r.session_id
 where s.game_id=any(p_game_ids) and not coalesce(p.is_gm,false)
), scores as (
 select p.game_id, round(avg(score)::numeric,1) average_score, max(score)::numeric high_score, count(score) score_count
 from players p group by p.game_id
), rounds as (
 select p.game_id, round_id,
 bool_and(is_winner is not null) complete,
 bool_and(faction is not null) known_factions,
 count(*) filter(where faction='good') good_count,
 count(*) filter(where faction='evil') evil_count,
 bool_and(is_winner) filter(where faction='good') good_won,
 bool_or(is_winner) filter(where faction='good') good_any,
 bool_and(is_winner) filter(where faction='evil') evil_won,
 bool_or(is_winner) filter(where faction='evil') evil_any,
 bool_and(coalesce(team_name in ('협력 팀','반협력 플레이어','반협력 배신자'),false)) cooperative,
 count(*) filter(where team_name in ('협력 팀','반협력 플레이어')) coop_players,
 bool_and(case when team_name='반협력 배신자' then not is_winner else is_winner end) coop_won,
 bool_or(case when team_name='반협력 배신자' then not is_winner else is_winner end) coop_any
 from players p group by p.game_id,round_id
), role_stats as (
 select r.game_id, round(100.0*count(*) filter(where good_won)/count(*),1) good_rate,
 round(100.0*count(*) filter(where evil_won)/count(*),1) evil_rate, count(*) role_count
 from rounds r where complete and known_factions and good_count>0 and evil_count>0
 and good_won=good_any and evil_won=evil_any and good_won<>evil_won group by r.game_id
), coop_stats as (
 select r.game_id, round(100.0*count(*) filter(where coop_won)/count(*),1) success_rate,count(*) coop_count
 from rounds r where complete and cooperative and coop_players>0 and coop_won=coop_any group by r.game_id
)
select ids.id, s.average_score,s.high_score,coalesce(s.score_count,0),rs.good_rate,rs.evil_rate,coalesce(rs.role_count,0),cs.success_rate,coalesce(cs.coop_count,0)
from (select distinct unnest(p_game_ids) id) ids
left join scores s on s.game_id=ids.id left join role_stats rs on rs.game_id=ids.id left join coop_stats cs on cs.game_id=ids.id;
$$;
revoke all on function public.get_game_result_statistics(uuid[]) from public;
grant execute on function public.get_game_result_statistics(uuid[]) to authenticated;
commit;
