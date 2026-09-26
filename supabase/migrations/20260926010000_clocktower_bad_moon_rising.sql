begin;
alter table public.clocktower_live_rooms add column script text not null default 'TB' check(script in ('TB','BMR')),
 add column bmr_state jsonb not null default '{"cursor":0,"notes":"","completed":false,"history":[]}', add column bmr_revision integer not null default 0;
alter table public.clocktower_live_members add column bmr jsonb not null default '{"life":"ALIVE","faction":"GOOD","drunk":false,"poisoned":false,"protected":false,"spent":false}';
alter table public.clocktower_live_requests drop constraint clocktower_live_requests_target_count_check;
alter table public.clocktower_live_requests add constraint clocktower_live_requests_target_count_check check(target_count between 0 and 3),
 add column bmr_options jsonb not null default '{}', add column bmr_answer jsonb not null default '{}';

create function public.clocktower_bmr_role_kind(role text) returns text language sql immutable set search_path=public as $$
 select case when role=any(array['할머니','선원','객실 청소부','구마사제','여관 주인','도박사','험담꾼','궁정대신','교수','음유시인','찻집 여인','평화주의자','어릿광대']) then '주민'
 when role=any(array['건달','미치광이','땜장이','달의 자손']) then '외지인'
 when role=any(array['대부','악마의 변호사','암살자','주모자']) then '하수인'
 when role=any(array['좀비얼','푸카','샤발로스','포']) then '악마' end;
$$;
revoke all on function public.clocktower_bmr_role_kind(text) from public,anon,authenticated;

alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_before_bmr;
revoke all on function public.clocktower_live_snapshot_before_bmr(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb;r public.clocktower_live_rooms;roster jsonb;
begin
 s:=public.clocktower_live_snapshot_before_bmr(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select * into r from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
 s:=jsonb_set(s,'{room}',s->'room'||jsonb_build_object('script',r.script));
 if r.script='BMR' then
  select jsonb_agg(x.value||case when r.storyteller_id=auth.uid() then jsonb_build_object('bmr',m.bmr)
   when m.user_id=auth.uid() and r.roles_released then jsonb_build_object('faction',case when m.actual_role='미치광이' then 'EVIL' else m.bmr->>'faction' end) else '{}'::jsonb end order by x.ordinality)
   into roster from jsonb_array_elements(s->'members') with ordinality x(value,ordinality) join public.clocktower_live_members m on m.room_id=r.id and m.user_id::text=x.value->>'user_id';
  s:=jsonb_set(s,'{members}',coalesce(roster,'[]'));
  if r.storyteller_id=auth.uid() then s:=s||jsonb_build_object('bmr',r.bmr_state,'bmr_revision',r.bmr_revision);end if;
 end if;
 return s;
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_before_bmr;
revoke all on function public.clocktower_live_command_before_bmr(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms;q public.clocktower_live_requests; m public.clocktower_live_members;mission public.clocktower_live_missions;
 uid uuid; picked uuid[]; actual text; shown text; kind text; options jsonb; answer jsonb; row_data jsonb; state_data jsonb; n integer; nt integer;no integer;nm integer;nd integer;adjustment integer;expected integer[];
 first_order text[]:=array['황혼','하수인 정보','미치광이','악마 정보','선원','궁정대신','대부','악마의 변호사','푸카','할머니','객실 청소부','새벽'];
 other_order text[]:=array['황혼','선원','여관 주인','궁정대신','도박사','악마의 변호사','미치광이','구마사제','좀비얼','푸카','샤발로스','포','암살자','대부','교수','험담꾼','땜장이','달의 자손','할머니','객실 청소부','새벽'];
 steps text[];cursor_pos integer; candidate uuid;top_count integer;leaders integer;life text;faction text;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 if p_action='create' then
  perform public.clocktower_live_command_before_bmr(p_event_id,p_action,p_data);
  update public.clocktower_live_rooms set script='BMR' where event_id=p_event_id and phase='SETUP' and exists(select 1 from public.events where id=p_event_id and title like '%피로 물든 달%');
  return;
 end if;
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if r.id is null or r.id::text is distinct from p_data->>'room_id' then raise exception '진행방이 바뀌었습니다. 새로고침해 주세요.';end if;
 if p_action='script_set' then
  if r.storyteller_id<>auth.uid() or r.phase<>'SETUP' or r.roles_released then raise exception '이야기꾼이 역할 배포 전에만 시나리오를 바꿀 수 있습니다.';end if;
  if coalesce(p_data->>'script','') not in ('TB','BMR') then raise exception '지원하는 시나리오를 선택해 주세요.';end if;
  if r.script=p_data->>'script' then return;end if;
  update public.clocktower_live_members set actual_role='',shown_role='',role_confirmed=false,bmr='{"life":"ALIVE","faction":"GOOD","drunk":false,"poisoned":false,"protected":false,"spent":false}',alive=true,public_alive=true where room_id=r.id;
  update public.clocktower_live_rooms set script=p_data->>'script',night_engine='{}',engine_version=engine_version+1,flow_revision=flow_revision+1,bmr_revision=bmr_revision+1,bmr_state='{"cursor":0,"notes":"","completed":false,"history":[]}' where id=r.id;return;
 end if;
 if r.script<>'BMR' then perform public.clocktower_live_command_before_bmr(p_event_id,p_action,p_data);return;end if;
 if r.phase='ENDED' then raise exception '종료된 게임입니다.';end if;
 -- Shared actions retain the established privacy, permission and offline voting checks.
 if p_action=any(array['role_ack','roles_reset','ack','ack_offline','cancel','mission_offline','sync_participants','swap_seats','remove_member','vote_nominate','vote_start','vote_record','vote_finish','vote_cancel']) then
  perform public.clocktower_live_command_before_bmr(p_event_id,p_action,p_data);return;
 end if;
 if p_action='reply' then
  select * into q from public.clocktower_live_requests where room_id=r.id and id=(p_data->>'request_id')::uuid and user_id=auth.uid() for update;
  if q.id is null or q.status<>'OPEN' or r.phase<>'NIGHT' or q.night<>r.night then raise exception '현재 본인의 요청만 제출할 수 있습니다.';end if;
  options:=q.bmr_options;answer:=coalesce(p_data->'answer','{}');
  select coalesce(array_agg(value::uuid),'{}') into picked from jsonb_array_elements_text(coalesce(p_data->'targets','[]'));
  if coalesce((answer->>'pass')::boolean,false) then
   if not coalesce((options->>'pass')::boolean,false) or cardinality(picked)<>0 then raise exception '이번 능력은 건너뛸 수 없습니다.';end if;
  else
   if cardinality(picked)<>q.target_count or cardinality(picked)<>(select count(distinct x) from unnest(picked) x) then raise exception '서로 다른 대상을 지정된 수만큼 선택해 주세요.';end if;
   if exists(select 1 from unnest(picked) x where not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=x)) or (not q.allow_self and auth.uid()=any(picked)) then raise exception '선택할 수 없는 참가자입니다.';end if;
   -- Do not validate private life here: a night death must not leak through an error.
   if coalesce((options->>'character')::boolean,false) and public.clocktower_bmr_role_kind(answer->>'character') is null then raise exception '캐릭터를 선택해 주세요.';end if;
  end if;
  update public.clocktower_live_requests set targets=picked,bmr_answer=jsonb_build_object('pass',coalesce((answer->>'pass')::boolean,false),'character',case when coalesce((options->>'character')::boolean,false) then answer->>'character' else null end),status='SUBMITTED' where id=q.id;return;
 end if;
 if p_action='mission_complete' then
  select * into mission from public.clocktower_live_missions where room_id=r.id and id=(p_data->>'mission_id')::uuid and user_id=auth.uid() for update;
  if mission.id is null or r.phase<>'NIGHT' or mission.night<>r.night or mission.completed or clock_timestamp()<mission.available_at then raise exception '현재 도착한 미션만 완료할 수 있습니다.';end if;
  options:=coalesce(mission.challenge->'bmr_options','{}');answer:=coalesce(p_data->'selection','{}');
  if options='{}' then perform public.clocktower_live_command_before_bmr(p_event_id,p_action,p_data);return;end if;
  if not(coalesce((options->>'pass')::boolean,false) and coalesce((answer->>'pass')::boolean,false)) then
   if coalesce((options->>'character')::boolean,false) and public.clocktower_bmr_role_kind(answer->>'character') is null then raise exception '캐릭터를 선택해 주세요.';end if;
   if mission.kind='SELECT' and (coalesce(cardinality(string_to_array(p_data->>'answer',',')),0)<>coalesce((mission.challenge->>'target_count')::integer,0) or (select count(distinct x) from unnest(string_to_array(p_data->>'answer',',')) x)<>coalesce((mission.challenge->>'target_count')::integer,0) or exists(select 1 from unnest(string_to_array(p_data->>'answer',',')) x where not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id::text=x))) then raise exception '안내에 맞게 선택해 주세요.';end if;
  end if;
  update public.clocktower_live_missions set completed=true where id=mission.id;return;
 end if;
 if r.storyteller_id<>auth.uid() then raise exception '이야기꾼만 진행할 수 있습니다.';end if;
 if (p_data->>'bmr_revision')::integer is distinct from r.bmr_revision then raise exception '진행 상태가 변경되었습니다. 새로고침 후 다시 확인해 주세요.';end if;
 steps:=case when r.night=1 then first_order else other_order end;cursor_pos:=coalesce((r.bmr_state->>'cursor')::integer,0);
 if p_action='bmr_save_roles' then
  if r.phase<>'SETUP' or r.roles_released or jsonb_typeof(p_data->'rows') is distinct from 'array' then raise exception '역할 배포 전만 배정을 저장할 수 있습니다.';end if;
  if jsonb_array_length(p_data->'rows')<>(select count(*) from public.clocktower_live_members where room_id=r.id) or (select count(distinct x->>'user_id') from jsonb_array_elements(p_data->'rows') x)<>jsonb_array_length(p_data->'rows') then raise exception '참가자 목록이 변경되었습니다.';end if;
  for row_data in select value from jsonb_array_elements(p_data->'rows') loop
   select * into r from public.clocktower_live_rooms where id=r.id;
   kind:=public.clocktower_bmr_role_kind(row_data->>'actual_role');
   perform public.clocktower_live_command(p_event_id,'bmr_member',row_data||jsonb_build_object('room_id',r.id,'bmr_revision',r.bmr_revision,'bmr',jsonb_build_object('life','ALIVE','faction',case when kind in ('하수인','악마') then 'EVIL' else 'GOOD' end)));
  end loop;
 elsif p_action='bmr_member' then
  if r.phase='SETUP' and r.roles_released then raise exception '준비로 돌아간 뒤 수정해 주세요.';end if;
  if exists(select 1 from public.clocktower_live_votes where room_id=r.id and status in ('WAITING','RUNNING')) then raise exception '투표를 마친 뒤 상태를 변경해 주세요.';end if;
  uid:=(p_data->>'user_id')::uuid;actual:=p_data->>'actual_role';shown:=p_data->>'shown_role';kind:=public.clocktower_bmr_role_kind(actual);
  select * into m from public.clocktower_live_members where room_id=r.id and user_id=uid;
  if m.user_id is null or kind is null or (actual='미치광이' and public.clocktower_bmr_role_kind(shown) is distinct from '악마') or (actual<>'미치광이' and shown is distinct from actual) then raise exception '배정된 참가자의 실제 역할과 표시 역할을 확인해 주세요.';end if;
  life:=p_data->'bmr'->>'life';faction:=p_data->'bmr'->>'faction';
  if coalesce(life,'') not in ('ALIVE','DEAD','ZOMBIE') or (life='ZOMBIE' and actual<>'좀비얼') or coalesce(faction,'') not in ('GOOD','EVIL') then raise exception '생존 상태와 진영을 확인해 주세요.';end if;
  if r.phase='SETUP' and (life<>'ALIVE' or faction<>case when kind in ('악마','하수인') then 'EVIL' else 'GOOD' end) then raise exception '준비 단계에는 기본 생존·진영으로 배정해 주세요.';end if;
  state_data:=jsonb_build_object('life',life,'faction',faction,'drunk',coalesce((p_data->'bmr'->>'drunk')::boolean,false),'poisoned',coalesce((p_data->'bmr'->>'poisoned')::boolean,false),'protected',coalesce((p_data->'bmr'->>'protected')::boolean,false),'spent',coalesce((p_data->'bmr'->>'spent')::boolean,false));
  update public.clocktower_live_members set actual_role=actual,shown_role=shown,bmr=state_data,alive=life='ALIVE',public_alive=case when r.phase in ('SETUP','DAY') then life='ALIVE' else public_alive end,notes=coalesce(p_data->>'notes',''),ghost_vote_used=case when life='ALIVE' and m.bmr->>'life'<>'ALIVE' then false else ghost_vote_used end where room_id=r.id and user_id=uid;

  if r.phase='NIGHT' and actual='건달' and m.bmr->>'faction' is distinct from faction then
   insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,status,result)
    values(r.id,uid,r.night,'소속 변경 안내',0,'RESOLVED',case when faction='EVIL' then '현재 당신은 악한 팀입니다.' else '현재 당신은 선한 팀입니다.' end);
  end if;
 elsif p_action='bmr_notes' then
  if length(coalesce(p_data->>'notes',''))>10000 then raise exception '진행 메모는 10000자까지입니다.';end if;
  update public.clocktower_live_rooms set bmr_state=jsonb_set(bmr_state,'{notes}',to_jsonb(coalesce(p_data->>'notes',''))) where id=r.id;
 elsif p_action='bmr_request' then
  if r.phase<>'NIGHT' then raise exception '밤에만 요청할 수 있습니다.';end if;
  if exists(select 1 from public.clocktower_live_requests where room_id=r.id and status in ('OPEN','SUBMITTED')) then raise exception '현재 선택을 먼저 전달하거나 취소해 주세요.';end if;
  options:=coalesce(p_data->'options','{}');
  if jsonb_typeof(options)<>'object' or length(options::text)>500 then raise exception '요청 형식이 올바르지 않습니다.';end if;
  options:=jsonb_build_object('character',coalesce((options->>'character')::boolean,false),'pass',coalesce((options->>'pass')::boolean,false),'living',coalesce((options->>'living')::boolean,false),'dead',coalesce((options->>'dead')::boolean,false));
  n:=(p_data->>'target_count')::integer;
  insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,allow_self,status,bmr_options)
   values(r.id,(p_data->>'user_id')::uuid,r.night,trim(p_data->>'prompt'),n,coalesce((p_data->>'allow_self')::boolean,true),case when n=0 and not (options->>'character')::boolean and not (options->>'pass')::boolean then 'SUBMITTED' else 'OPEN' end,options);
 elsif p_action='bmr_resolve' then
  select * into q from public.clocktower_live_requests where room_id=r.id and id=(p_data->>'request_id')::uuid for update;
  if q.id is null or q.night<>r.night or r.phase<>'NIGHT' or q.status<>'SUBMITTED' then raise exception '현재 제출된 요청만 전달할 수 있습니다.';end if;
  if length(trim(coalesce(p_data->>'result',''))) not between 1 and 2000 then raise exception '전달할 결과를 입력해 주세요.';end if;
  update public.clocktower_live_requests set status='RESOLVED',result=trim(p_data->>'result') where id=q.id;
 elsif p_action='bmr_step' then
  if r.phase<>'NIGHT' or coalesce((r.bmr_state->>'completed')::boolean,false) then raise exception '진행할 밤 차례가 없습니다.';end if;
  if exists(select 1 from public.clocktower_live_requests where room_id=r.id and status in ('OPEN','SUBMITTED')) then raise exception '선택을 전달하거나 취소한 뒤 다음 차례로 넘어가세요.';end if;
  if length(trim(coalesce(p_data->>'note',''))) not between 1 and 1000 then raise exception '판정 또는 건너뛴 사유를 기록해 주세요.';end if;
  update public.clocktower_live_rooms set bmr_state=bmr_state||jsonb_build_object('cursor',least(cursor_pos+1,cardinality(steps)-1),'completed',cursor_pos=cardinality(steps)-1,'history',coalesce(bmr_state->'history','[]')||jsonb_build_array(jsonb_build_object('night',r.night,'step',steps[cursor_pos+1],'note',p_data->>'note'))) where id=r.id;
 elsif p_action='flow_next' then
  if (p_data->>'revision')::integer is distinct from r.flow_revision then raise exception '이미 단계가 변경되었습니다.';end if;
  if exists(select 1 from public.clocktower_live_votes where room_id=r.id and status in ('WAITING','RUNNING')) then raise exception '투표를 먼저 마쳐 주세요.';end if;
  if r.phase='SETUP' then
   select count(*),count(*) filter(where public.clocktower_bmr_role_kind(actual_role)='주민'),count(*) filter(where public.clocktower_bmr_role_kind(actual_role)='외지인'),count(*) filter(where public.clocktower_bmr_role_kind(actual_role)='하수인'),count(*) filter(where public.clocktower_bmr_role_kind(actual_role)='악마') into n,nt,no,nm,nd from public.clocktower_live_members where room_id=r.id;
   if n not between 5 and 15 or nt+no+nm+nd<>n or (select count(distinct actual_role) from public.clocktower_live_members where room_id=r.id)<>n then raise exception '5~15명의 서로 다른 역할을 배정해 주세요.';end if;
   expected:=case n when 5 then array[3,0,1,1] when 6 then array[3,1,1,1] when 7 then array[5,0,1,1] when 8 then array[5,1,1,1] when 9 then array[5,2,1,1] when 10 then array[7,0,2,1] when 11 then array[7,1,2,1] when 12 then array[7,2,2,1] when 13 then array[9,0,3,1] when 14 then array[9,1,3,1] else array[9,2,3,1] end;
   adjustment:=no-expected[2];
   if nm<>expected[3] or nd<>1 or nt<>expected[1]-adjustment or (exists(select 1 from public.clocktower_live_members where room_id=r.id and actual_role='대부') and abs(adjustment)<>1) or (not exists(select 1 from public.clocktower_live_members where room_id=r.id and actual_role='대부') and adjustment<>0) then raise exception '인원 구성과 대부의 외지인 ±1 조정을 확인해 주세요.';end if;
   if not r.roles_released then
    update public.clocktower_live_rooms set roles_released=true,flow_revision=flow_revision+1,bmr_revision=bmr_revision+1 where id=r.id;
    update public.clocktower_live_members set role_confirmed=false where room_id=r.id;return;
   end if;
   if exists(select 1 from public.clocktower_live_members where room_id=r.id and not role_confirmed) then raise exception '전원 역할 확인을 기다려 주세요.';end if;
   update public.clocktower_live_rooms set phase='NIGHT',night=1,bmr_state=bmr_state||'{"cursor":0,"completed":false}',night_started_at=clock_timestamp() where id=r.id;
  elsif r.phase='NIGHT' then
   if not coalesce((r.bmr_state->>'completed')::boolean,false) then raise exception '새벽까지 밤 차례를 완료해 주세요.';end if;
   if exists(select 1 from public.clocktower_live_requests where room_id=r.id and (status in ('OPEN','SUBMITTED') or (status='RESOLVED' and not acknowledged))) or exists(select 1 from public.clocktower_live_missions where room_id=r.id and night=r.night and not completed) then raise exception '전달한 결과와 공통 미션을 모두 확인해야 합니다.';end if;
   update public.clocktower_live_members set public_alive=alive where room_id=r.id;
   update public.clocktower_live_rooms set phase='DAY',day_stage='PRIVATE' where id=r.id;
  elsif r.day_stage='PRIVATE' then
   update public.clocktower_live_rooms set day_stage='NOMINATIONS' where id=r.id;
  else
   select max(x.n) into top_count from (select (select count(*) from jsonb_each(ballots) b where b.value='true') n from public.clocktower_live_votes where room_id=r.id and day=r.night and status='DONE') x;
   select count(*) into leaders from public.clocktower_live_votes v where v.room_id=r.id and v.day=r.night and v.status='DONE' and (select count(*) from jsonb_each(v.ballots) b where b.value='true')=top_count;
   if leaders=1 then select nominee into candidate from public.clocktower_live_votes v where v.room_id=r.id and v.day=r.night and v.status='DONE' and top_count>=v.threshold and (select count(*) from jsonb_each(v.ballots) b where b.value='true')=top_count;end if;
   if candidate::text is distinct from nullif(p_data->>'execution','') or coalesce((p_data->>'reviewed')::boolean,false) is not true then raise exception '처형 후보와 보호·주모자·승리 판정을 확인해 주세요.';end if;
   if candidate is not null then
    select * into m from public.clocktower_live_members where room_id=r.id and user_id=candidate;
    life:=p_data->>'execution_life';
    if coalesce(life,'') not in ('ALIVE','DEAD','ZOMBIE') or (life='ZOMBIE' and m.actual_role<>'좀비얼') or (m.bmr->>'life'='DEAD' and life<>'DEAD') then raise exception '처형 후 실제 상태를 확인해 주세요.';end if;
    update public.clocktower_live_members set alive=life='ALIVE',public_alive=life='ALIVE',bmr=jsonb_set(bmr,'{life}',to_jsonb(life)) where room_id=r.id and user_id=candidate;
   end if;
   update public.clocktower_live_rooms set phase='NIGHT',night=night+1,night_started_at=clock_timestamp(),bmr_state=bmr_state||jsonb_build_object('cursor',0,'completed',false,'history',coalesce(bmr_state->'history','[]')||jsonb_build_array(jsonb_build_object('night',r.night,'step','낮 종료','note',coalesce(p_data->>'note','')||' / 처형 후보: '||coalesce(candidate::text,'없음')))) where id=r.id;
  end if;
  update public.clocktower_live_rooms set flow_revision=flow_revision+1 where id=r.id;
  select * into r from public.clocktower_live_rooms where id=r.id;
  if r.phase='NIGHT' then perform public.clocktower_make_missions(r,1);end if;
 elsif p_action='bmr_end' then
  if coalesce(p_data->>'winner','') not in ('GOOD','EVIL') or length(trim(coalesce(p_data->>'reason',''))) not between 1 and 1000 then raise exception '승리 진영과 판정 사유를 선택해 주세요.';end if;
  if r.phase='SETUP' then raise exception '시작 전 게임은 승리 기록을 만들 수 없습니다.';end if;
  perform public.clocktower_end_game(r.id,p_data->>'winner',p_data->>'reason');
 else raise exception '피로 물든 달 전용 진행 화면을 이용해 주세요.';
 end if;
 update public.clocktower_live_rooms set bmr_revision=bmr_revision+1 where id=r.id;
 if p_action=any(array['bmr_member','bmr_resolve','bmr_step','flow_next','bmr_end']) then
  insert into public.clocktower_recap_entries(room_id,night,phase,title,details) values(r.id,r.night,r.phase,'피로 물든 달 · '||p_action,jsonb_build_array(case p_action when 'bmr_member' then public.clocktower_recap_name(r.id,(p_data->>'user_id')::uuid)||' · '||(p_data->'bmr'->>'life')||' / '||(p_data->'bmr'->>'faction') when 'bmr_resolve' then public.clocktower_recap_name(r.id,q.user_id)||' · 전달: '||(p_data->>'result') when 'bmr_step' then steps[cursor_pos+1]||' · '||(p_data->>'note') when 'bmr_end' then p_data->>'reason' else '진행 단계 변경 · '||coalesce(p_data->>'note','') end));
 end if;
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;

-- Cover controls match character selection and optional passing without exposing why a player woke.
alter function public.clocktower_cover_missions() rename to clocktower_cover_missions_before_bmr;
-- A trigger function cannot be invoked directly: extend its original definition instead.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.clocktower_cover_missions_before_bmr()'::regprocedure);
 definition:=replace(definition,'clocktower_cover_missions_before_bmr','clocktower_cover_missions');
 definition:=replace(definition,'insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge,available_at)', $new$if exists(select 1 from public.clocktower_live_rooms where id=new.room_id and script='BMR') and new.status<>'RESOLVED' then
   challenge_value:=challenge_value||jsonb_build_object('bmr_options',new.bmr_options);
   if coalesce((new.bmr_options->>'character')::boolean,false) then k:='SELECT';end if;
  end if;
  insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge,available_at)$new$);
 execute definition;
end $patch$;
-- Rebind both original cover triggers to the extended function.
do $patch$
declare t record;
begin
 for t in select tgname,pg_get_triggerdef(oid) as definition from pg_trigger where tgfoid='public.clocktower_cover_missions_before_bmr()'::regprocedure loop
  execute format('drop trigger %I on public.clocktower_live_requests',t.tgname);
  execute replace(t.definition,'clocktower_cover_missions_before_bmr','clocktower_cover_missions');
 end loop;
end $patch$;
revoke all on function public.clocktower_cover_missions() from public,anon,authenticated;
create or replace function public.clocktower_save_finished_result(p_room uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; gid uuid; sid uuid; rid uuid; seq integer;
 m record; kind text; faction text;
begin
 select * into r from public.clocktower_live_rooms where id=p_room for update;
 if r.id is null or r.phase<>'ENDED' or r.winner is null or r.winner not in ('GOOD','EVIL') then return null;end if;
 if r.result_round_id is not null then return r.result_round_id;end if;
 -- Serialize round allocation across rooms belonging to the same event.
 perform pg_advisory_xact_lock(hashtextextended(r.event_id::text,0));
 select id into gid from public.games where name ilike '%시계탑에 흐른 피%' order by name,id limit 1;
 if gid is null then raise exception '시계탑 게임 항목이 없어 결과를 저장하지 못했습니다.';end if;
 select id into sid from public.event_game_sessions where event_id=r.event_id and game_id=gid order by created_at,id limit 1;
 if sid is null then
  insert into public.event_game_sessions(event_id,game_id,result_type,created_by) values(r.event_id,gid,'ROLE',r.storyteller_id) returning id into sid;
 end if;
 select coalesce(max(round_number),0)+1 into seq from public.event_game_rounds where session_id=sid;
 insert into public.event_game_rounds(session_id,round_number,created_by) values(sid,seq,r.storyteller_id) returning id into rid;
 for m in select * from public.clocktower_live_members where room_id=r.id order by seat loop
  kind:=case when r.script='BMR' then public.clocktower_bmr_role_kind(m.actual_role) else case when m.actual_role='임프' then '악마'
   when m.actual_role=any(array['독살범','첩자','남작','탕녀']) then '하수인'
   when m.actual_role=any(array['집사','주정뱅이','은둔자','성자']) then '외지인'
   when m.actual_role=any(array['세탁부','사서','수사관','요리사','초공감자','점쟁이','장의사','수도사','까마귀지기','성결자','처단자','군인','시장']) then '주민' else null end end;
  if kind is null then raise exception '알 수 없는 캐릭터로 결과를 저장할 수 없습니다: %',m.actual_role;end if;
  faction:=case when r.script='BMR' then case when m.bmr->>'faction'='EVIL' then '악' else '선' end else case when kind in ('악마','하수인') then '악' else '선' end end;
  insert into public.event_round_players(round_id,user_id,role_name,team_name,is_winner,is_gm,updated_at)
   values(rid,m.user_id,m.actual_role,case when r.script='BMR' then '피로 물든 달 · ' else '점철되는 혼란 · ' end||kind||' · '||faction,
    faction=case when r.winner='GOOD' then '선' else '악' end,false,now());
 end loop;
 if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=r.storyteller_id) then
  insert into public.event_round_players(round_id,user_id,role_name,team_name,is_winner,is_gm,updated_at)
   values(rid,r.storyteller_id,null,null,null,true,now());
 end if;
 update public.clocktower_live_rooms set result_round_id=rid,result_saved_at=now() where id=r.id;
 return rid;
end $$;

commit;
