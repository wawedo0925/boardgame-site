begin;

-- The host runs the same deterministic reducer as the tests. Persist the whole
-- decision/action atomically; participants cannot write any adjudication state.
create function public.clocktower_bmr_auto_commit(p_event_id uuid,p_data jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; old_state jsonb; next_state jsonb; item jsonb; projection jsonb;
 q public.clocktower_live_requests; spec jsonb; member_row public.clocktower_live_members;
 next_phase text; next_night integer; expected_candidate uuid; highest integer; leaders integer;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if r.id is null or r.id::text is distinct from p_data->>'room_id' or r.storyteller_id<>auth.uid() or r.script<>'BMR' then raise exception '현재 방의 이야기꾼만 판정할 수 있습니다.';end if;
 if r.phase not in ('NIGHT','DAY') or not coalesce((r.bmr_state->>'automated')::boolean,false) then raise exception '자동 진행 중인 방이 아닙니다.';end if;
 if (p_data->>'bmr_revision')::integer is distinct from r.bmr_revision or (p_data->>'revision')::integer is distinct from r.flow_revision then raise exception '다른 판정이 먼저 저장되었습니다. 최신 화면에서 확인해 주세요.';end if;
 if exists(select 1 from public.clocktower_live_votes where room_id=r.id and status in ('WAITING','RUNNING')) then raise exception '투표를 마친 뒤 판정하세요.';end if;
 old_state:=r.bmr_state->'auto';next_state:=p_data->'auto';
 if old_state is null and (r.phase<>'NIGHT' or r.night<>1 or exists(select 1 from public.clocktower_live_requests where room_id=r.id)) then raise exception '첫 밤 시작 전에만 자동 진행을 초기화할 수 있습니다.';end if;
 if jsonb_typeof(next_state) is distinct from 'object' or (next_state->>'version')::integer is distinct from 1 or octet_length(next_state::text)>500000 then raise exception '판정 상태가 올바르지 않습니다.';end if;
 next_phase:=next_state->>'phase';next_night:=(next_state->>'night')::integer;
 if coalesce(next_phase,'') not in ('NIGHT','DAY','ENDED') or next_night is null or next_night not between r.night and r.night+1 then raise exception '진행 단계가 올바르지 않습니다.';end if;
 if next_night=r.night+1 and (r.phase<>'DAY' or r.day_stage<>'NOMINATIONS' or next_phase<>'NIGHT') then raise exception '처형 확정 후에만 다음 밤을 시작할 수 있습니다.';end if;
 if r.phase='DAY' and p_data->>'operation'='execution' then
  if r.day_stage<>'NOMINATIONS' then raise exception '지목 단계에서만 처형을 확정할 수 있습니다.';end if;
  select max(x.n) into highest from (select (select count(*) from jsonb_each(ballots) b where b.value='true') n from public.clocktower_live_votes where room_id=r.id and day=r.night and status='DONE') x;
  select count(*) into leaders from public.clocktower_live_votes v where v.room_id=r.id and v.day=r.night and v.status='DONE' and (select count(*) from jsonb_each(v.ballots) b where b.value='true')=highest;
  if leaders=1 then select nominee into expected_candidate from public.clocktower_live_votes v where v.room_id=r.id and v.day=r.night and v.status='DONE' and highest>=v.threshold and (select count(*) from jsonb_each(v.ballots) b where b.value='true')=highest;end if;
  if p_data->>'operation'='execution' and expected_candidate::text is distinct from nullif(p_data->>'execution','') then raise exception '처형 후보가 바뀌었습니다.';end if;
 end if;
 if next_phase='DAY' and r.phase='NIGHT' then
  if not coalesce((old_state->>'finished')::boolean,false) or old_state?'pending' or old_state?'waiting' then raise exception '밤 판정을 먼저 완료하세요.';end if;
  if exists(select 1 from public.clocktower_live_requests where room_id=r.id and (status in ('OPEN','SUBMITTED') or status='RESOLVED' and not acknowledged)) or exists(select 1 from public.clocktower_live_missions where room_id=r.id and night=r.night and not completed) then raise exception '참가자의 결과와 미션 확인을 기다려 주세요.';end if;
 end if;
 if p_data->>'request_id' is not null then
  select * into q from public.clocktower_live_requests where room_id=r.id and id=(p_data->>'request_id')::uuid for update;
  if q.id is null or q.night<>r.night or q.status<>'SUBMITTED' or q.bmr_options->>'engine_key' is distinct from old_state->'waiting'->'task'->>'key' then raise exception '이미 처리되었거나 변경된 요청입니다.';end if;
  if to_jsonb(q.targets) is distinct from p_data->'targets' or q.bmr_answer is distinct from p_data->'answer' then raise exception '참가자의 응답이 변경되었습니다.';end if;
 end if;
 if jsonb_typeof(next_state->'players') is distinct from 'array' or jsonb_array_length(next_state->'players')<>(select count(*) from public.clocktower_live_members where room_id=r.id) or (select count(distinct value->>'id') from jsonb_array_elements(next_state->'players'))<>jsonb_array_length(next_state->'players') then raise exception '참가자 명단이 변경되었습니다.';end if;
 if jsonb_typeof(p_data->'projection') is distinct from 'array' or jsonb_array_length(p_data->'projection')<>jsonb_array_length(next_state->'players') or (select count(distinct value->>'user_id') from jsonb_array_elements(p_data->'projection'))<>jsonb_array_length(next_state->'players') then raise exception '상태 목록이 올바르지 않습니다.';end if;
 for item in select value from jsonb_array_elements(next_state->'players') loop
  select * into member_row from public.clocktower_live_members where room_id=r.id and user_id=(item->>'id')::uuid;
  if member_row.user_id is null or member_row.actual_role is distinct from item->>'role' or member_row.shown_role is distinct from item->>'shown' then raise exception '역할 배정이 변경되었습니다.';end if;
  select value->'bmr' into projection from jsonb_array_elements(p_data->'projection') where value->>'user_id'=item->>'id';
  if projection is null or coalesce(item->>'life','') not in ('ALIVE','DEAD','ZOMBIE') or (item->>'life'='ZOMBIE' and item->>'role'<>'좀비얼') or coalesce(item->>'faction','') not in ('GOOD','EVIL') or projection->>'life' is distinct from item->>'life' or projection->>'faction' is distinct from item->>'faction' then raise exception '상태 판정이 올바르지 않습니다.';end if;
  update public.clocktower_live_members set bmr=projection,alive=item->>'life'='ALIVE',public_alive=case when r.phase='DAY' or next_phase in ('DAY','ENDED') then item->>'life'='ALIVE' else public_alive end,ghost_vote_used=case when member_row.bmr->>'life'='DEAD' and item->>'life'='ALIVE' then false else ghost_vote_used end where room_id=r.id and user_id=member_row.user_id;
 end loop;
 spec:=next_state->'out'->'request';
 if spec is not null then
  if exists(select 1 from public.clocktower_live_requests where room_id=r.id and status in ('OPEN','SUBMITTED')) then raise exception '기존 요청을 먼저 처리하세요.';end if;
  if spec->>'user_id' is distinct from next_state->'waiting'->'task'->>'actor' or spec->'options'->>'engine_key' is distinct from next_state->'waiting'->'task'->>'key' then raise exception '요청 차례가 올바르지 않습니다.';end if;
  insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,allow_self,status,bmr_options) values(r.id,(spec->>'user_id')::uuid,r.night,spec->>'prompt',(spec->>'target_count')::integer,(spec->>'allow_self')::boolean,'OPEN',spec->'options');
 end if;
 if next_state->'out'?'resolved' then
  if q.id is null or q.id::text is distinct from next_state->'out'->'resolved'->>'id' then raise exception '결과와 요청이 다릅니다.';end if;
  update public.clocktower_live_requests set status='RESOLVED',result=next_state->'out'->'resolved'->>'result' where id=q.id;
 end if;
 if next_state->'out'?'retry' then
  if q.id is null then raise exception '다시 받을 요청이 없습니다.';end if;
  update public.clocktower_live_requests set status='OPEN',targets='{}',bmr_answer='{}',prompt=next_state->'out'->>'retry' where id=q.id;
 end if;
 for item in select value from jsonb_array_elements(coalesce(next_state->'out'->'notices','[]')) loop
  insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,status,result) values(r.id,(item->>'user_id')::uuid,r.night,'비공개 안내',0,'RESOLVED',item->>'result');
 end loop;
 update public.clocktower_live_rooms set bmr_state=bmr_state||jsonb_build_object('auto',next_state-'out','completed',coalesce((next_state->>'finished')::boolean,false)),bmr_revision=bmr_revision+1,flow_revision=flow_revision+1,
  phase=case when next_phase='ENDED' then phase else next_phase end,night=next_night,day_stage=case when r.phase='NIGHT' and next_phase='DAY' then 'PRIVATE' else day_stage end,
  night_started_at=case when next_night>r.night then clock_timestamp() else night_started_at end where id=r.id;
 if next_night>r.night then select * into r from public.clocktower_live_rooms where id=r.id;perform public.clocktower_make_missions(r,1);end if;
 if next_phase='ENDED' then
  if coalesce(next_state->>'winner','') not in ('GOOD','EVIL') then raise exception '승리 판정이 없습니다.';end if;
  perform public.clocktower_end_game(r.id,next_state->>'winner',next_state->>'reason');
 end if;
 select coalesce(jsonb_agg(value order by ordinality),'[]') into item from jsonb_array_elements(coalesce(next_state->'log','[]')) with ordinality where ordinality>jsonb_array_length(coalesce(old_state->'log','[]'));
 if jsonb_array_length(item)>0 then insert into public.clocktower_recap_entries(room_id,night,phase,title,details) values(r.id,r.night,r.phase,'피로 물든 달 자동 판정',item);end if;
end $$;
revoke all on function public.clocktower_bmr_auto_commit(uuid,jsonb) from public,anon,authenticated;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_before_bmr_auto;
revoke all on function public.clocktower_live_command_before_bmr_auto(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 if p_action='bmr_auto_commit' then perform public.clocktower_bmr_auto_commit(p_event_id,p_data);return;end if;
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action='bmr_auto_enable' then
  if r.storyteller_id is distinct from auth.uid() or r.id::text is distinct from p_data->>'room_id' or r.script<>'BMR' or r.phase<>'SETUP' or r.bmr_revision is distinct from (p_data->>'bmr_revision')::integer then raise exception '준비 중인 방에서만 자동 진행을 설정할 수 있습니다.';end if;
  update public.clocktower_live_rooms set bmr_state=(bmr_state-'auto')||jsonb_build_object('automated',coalesce((p_data->>'enabled')::boolean,true)),bmr_revision=bmr_revision+1 where id=r.id;return;
 end if;
 if r.script='BMR' and r.bmr_state?'auto' and r.phase in ('NIGHT','DAY') then
  if r.bmr_state->'auto'?'pending' and p_action like 'vote_%' then raise exception '이야기꾼 판정을 먼저 완료해 주세요.';end if;
  if p_action=any(array['bmr_member','bmr_request','bmr_resolve','bmr_step','bmr_end','cancel','sync_participants','swap_seats','remove_member']) or (p_action='flow_next' and (r.phase<>'DAY' or r.day_stage<>'PRIVATE' or r.bmr_state->'auto'?'pending')) then raise exception '자동 진행 판정 화면을 이용해 주세요.';end if;
 end if;
 perform public.clocktower_live_command_before_bmr_auto(p_event_id,p_action,p_data);
 if p_action in ('create','script_set') then
  update public.clocktower_live_rooms set bmr_state=bmr_state||'{"automated":true}' where event_id=p_event_id and script='BMR' and phase='SETUP';
 end if;
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
