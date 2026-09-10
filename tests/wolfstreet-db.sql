-- Run after the migration. All fixtures and result changes are rolled back.
begin;
do $$
declare gid uuid;eid uuid;sid uuid;rid uuid;actor uuid;candidate uuid;ids uuid[];payload jsonb;baseline jsonb;after_clear jsonb;blocked boolean;
begin
 select id into gid from public.games where name='울프스트리트' limit 1;
 select id into eid from public.events order by created_at desc limit 1;
 for candidate in select id from auth.users loop
  perform set_config('request.jwt.claim.sub',candidate::text,true);
  if public.can_operate_event(eid) then actor:=candidate;exit;end if;
 end loop;
 assert actor is not null,'Missing authorized test actor';
 select array_agg(user_id) into ids from (select distinct user_id from public.event_round_players limit 5)x;
 assert cardinality(ids)=5,'Need five existing members';
 select jsonb_agg(to_jsonb(x) order by category) into baseline from public.get_wolfstreet_score_summary(gid)x;
 select id into sid from public.event_game_sessions where event_id=eid and game_id=gid limit 1;
 if sid is null then insert into public.event_game_sessions(event_id,game_id,created_by) values(eid,gid,actor) returning id into sid;end if;
 insert into public.event_game_rounds(session_id,round_number,created_by) select sid,coalesce(max(round_number),0)+1,actor from public.event_game_rounds where session_id=sid returning id into rid;
 insert into public.event_round_players(round_id,user_id) select rid,unnest(ids);
 select jsonb_agg(jsonb_build_object('userId',ids[i],'score',(array[20,20,5,1000,800])[i],'category',case when i<=3 then '울프스트리트/투자자' else '울프스트리트/중개인' end)) into payload from generate_series(1,5)i;
 perform public.save_wolfstreet_results(rid,'SPLIT',payload);
 assert (select count(*) from public.event_round_players where round_id=rid and is_winner)=3,'Independent tied winners';
 assert (select rank from public.event_round_players where round_id=rid and user_id=ids[3])=3,'Competition rank';
 assert (select rank from public.event_round_players where round_id=rid and user_id=ids[5])=2,'Broker rank';
 assert (select member_score_count from public.get_wolfstreet_score_summary(gid) where category='울프스트리트/투자자')=(select count(*) from public.event_round_players p join public.event_game_rounds r on r.id=p.round_id join public.event_game_sessions s on s.id=r.session_id where s.game_id=gid and p.role_name='울프스트리트/투자자' and p.score is not null and not p.is_gm),'Investor count';
 assert (select member_average_score from public.get_wolfstreet_score_summary(gid) where category='울프스트리트/중개인')=(select round(avg(p.score),1) from public.event_round_players p join public.event_game_rounds r on r.id=p.round_id join public.event_game_sessions s on s.id=r.session_id where s.game_id=gid and p.role_name='울프스트리트/중개인' and p.score is not null and not p.is_gm),'Broker average';
 blocked:=false;begin perform public.save_wolfstreet_results(rid,'COMBINED',payload);exception when others then blocked:=true;end;assert blocked,'Combined count validation';
 blocked:=false;begin perform public.save_wolfstreet_results(rid,'SPLIT',payload - 0);exception when others then blocked:=true;end;assert blocked,'Stale roster validation';
 payload:=jsonb_set(payload,'{4,isGm}','true');
 perform public.save_wolfstreet_results(rid,'COMBINED',payload);
 assert (select count(*) from public.event_round_players where round_id=rid and role_name='울프스트리트/총액')=4,'Combined category';
 assert (select is_winner from public.event_round_players where round_id=rid and user_id=ids[4]),'Combined winner';
 assert (select score is null and rank is null and role_name is null and is_winner is null from public.event_round_players where round_id=rid and user_id=ids[5]),'GM cleared';
 perform set_config('request.jwt.claim.sub','',true);
 blocked:=false;begin perform public.save_wolfstreet_results(rid,'COMBINED',payload);exception when others then blocked:=true;end;assert blocked,'Anonymous write blocked';
 assert (select sum(my_score_count) from public.get_wolfstreet_score_summary(gid))=0,'Anonymous personal privacy';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.event_round_players set score=null,rank=null,role_name=null,team_name=null,is_winner=null,is_gm=false where round_id=rid;
 select jsonb_agg(to_jsonb(x) order by category) into after_clear from public.get_wolfstreet_score_summary(gid)x;
 assert baseline=after_clear,'Clear restores all summary buckets';
 update public.event_round_players set score=123 where round_id=rid and user_id=ids[1];
 assert (select member_score_count from public.get_wolfstreet_score_summary(gid) where category='LEGACY')=(select (x->>'member_score_count')::bigint+1 from jsonb_array_elements(baseline)x where x->>'category'='LEGACY'),'Legacy segregated';
end $$;
select 'PASS: split ties, combined totals, GM, count, stale roster, anonymous access, averages, clear, legacy' as verification;
rollback;
