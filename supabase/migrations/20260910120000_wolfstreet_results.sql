begin;
-- Role-specific money rankings can tie; other games keep unique ordinal ranks.
drop index public.event_round_players_round_rank_uidx;
create unique index event_round_players_round_rank_uidx on public.event_round_players(round_id,rank)
where rank is not null and coalesce(role_name,'') not in ('울프스트리트/투자자','울프스트리트/중개인','울프스트리트/총액');
create function public.save_wolfstreet_results(p_round_id uuid,p_mode text,p_players jsonb) returns void language plpgsql security definer set search_path=public as $$
declare game_name text;row_count integer;n integer;
begin
 if auth.uid() is null or not public.can_manage_event_round_player(p_round_id) then raise exception '결과를 기록할 권한이 없습니다.';end if;
 perform 1 from public.event_game_rounds where id=p_round_id for update;
 select g.name into game_name from public.event_game_rounds r join public.event_game_sessions s on s.id=r.session_id join public.games g on g.id=s.game_id where r.id=p_round_id;
 if lower(regexp_replace(game_name,'[[:space:]:：-]','','g')) not in ('울프스트리트','wolfstreet') then raise exception '울프스트리트 기록에만 사용할 수 있습니다.';end if;
 if p_mode is null or p_mode not in ('SPLIT','COMBINED') or jsonb_typeof(p_players) is distinct from 'array' then raise exception '버전과 참가자를 확인해 주세요.';end if;
 select count(*) into row_count from public.event_round_players where round_id=p_round_id;
 if jsonb_array_length(p_players)<>row_count or (select count(distinct x->>'userId') from jsonb_array_elements(p_players)x)<>row_count or exists(select 1 from jsonb_array_elements(p_players)x where not exists(select 1 from public.event_round_players p where p.round_id=p_round_id and p.user_id::text=x->>'userId')) then raise exception '참가자가 변경되었습니다. 다시 열어 주세요.';end if;
 select count(*) into n from jsonb_array_elements(p_players)x where not coalesce((x->>'isGm')::boolean,false);
 if (p_mode='SPLIT' and n not between 5 and 11) or (p_mode='COMBINED' and n not between 3 and 4) then raise exception '선택한 버전의 참가 인원을 확인해 주세요.';end if;
 if exists(select 1 from jsonb_array_elements(p_players)x where not coalesce((x->>'isGm')::boolean,false) and (jsonb_typeof(x->'score') is distinct from 'number' or (x->>'score')::numeric<>trunc((x->>'score')::numeric) or abs((x->>'score')::numeric)>9007199254740991)) then raise exception '모든 참가자의 최종 금액을 정수로 입력해 주세요.';end if;
 if p_mode='SPLIT' and (exists(select 1 from jsonb_array_elements(p_players)x where not coalesce((x->>'isGm')::boolean,false) and coalesce(x->>'category','') not in ('울프스트리트/투자자','울프스트리트/중개인')) or (select count(distinct x->>'category') from jsonb_array_elements(p_players)x where not coalesce((x->>'isGm')::boolean,false))<>2) then raise exception '투자자와 중개인을 모두 지정해 주세요.';end if;
 with inputs as (
  select (x->>'userId')::uuid as user_id,coalesce((x->>'isGm')::boolean,false) as gm,(x->>'score')::numeric as score,case when p_mode='COMBINED' then '울프스트리트/총액' else x->>'category' end as category from jsonb_array_elements(p_players)x
 ), ranked as (
  select *,rank() over(partition by category order by score desc) as placing from inputs where not gm
 )
 update public.event_round_players p set is_gm=i.gm,score=case when i.gm then null else i.score end,role_name=case when i.gm then null else i.category end,team_name=null,rank=case when i.gm then null else r.placing::integer end,is_winner=case when i.gm then null else r.placing=1 end,updated_at=clock_timestamp()
 from inputs i left join ranked r on r.user_id=i.user_id where p.round_id=p_round_id and p.user_id=i.user_id;
end $$;
revoke all on function public.save_wolfstreet_results(uuid,text,jsonb) from public,anon;
grant execute on function public.save_wolfstreet_results(uuid,text,jsonb) to authenticated;

create function public.get_wolfstreet_score_summary(p_game_id uuid) returns table(category text,member_high_score numeric,member_average_score numeric,member_score_count bigint,my_high_score numeric,my_average_score numeric,my_score_count bigint)
language sql stable security definer set search_path=public as $$
 with scored as (
  select p.user_id,p.score::numeric as score,case when p.role_name in ('울프스트리트/투자자','울프스트리트/중개인','울프스트리트/총액') then p.role_name else 'LEGACY' end as bucket
  from public.event_round_players p join public.event_game_rounds r on r.id=p.round_id join public.event_game_sessions s on s.id=r.session_id join public.games g on g.id=s.game_id
  where s.game_id=p_game_id and p.score is not null and not p.is_gm and lower(regexp_replace(g.name,'[[:space:]:：-]','','g')) in ('울프스트리트','wolfstreet')
 ), categories as (select unnest(array['울프스트리트/투자자','울프스트리트/중개인','울프스트리트/총액','LEGACY']) as bucket)
 select c.bucket,max(s.score),round(avg(s.score),1),count(s.score),max(s.score) filter(where s.user_id=auth.uid()),round(avg(s.score) filter(where s.user_id=auth.uid()),1),count(s.score) filter(where s.user_id=auth.uid()) from categories c left join scored s on s.bucket=c.bucket group by c.bucket;
$$;
revoke all on function public.get_wolfstreet_score_summary(uuid) from public;
grant execute on function public.get_wolfstreet_score_summary(uuid) to anon,authenticated;
commit;
