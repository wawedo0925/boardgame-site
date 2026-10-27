begin;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_before_bmr_review;
revoke all on function public.clocktower_live_command_before_bmr_review(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; info jsonb; roster text; m public.clocktower_live_members; n integer; role_key text; next_data jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action in ('bmr_information','bmr_correction','bmr_skip') then
  if r.id is null or r.id::text is distinct from p_data->>'room_id' or r.storyteller_id is distinct from auth.uid() or r.script<>'BMR' or r.bmr_revision is distinct from (p_data->>'bmr_revision')::integer then raise exception '현재 방의 이야기꾼만 최신 상태에서 수정할 수 있습니다.';end if;
  if p_action='bmr_information' then
   if r.phase<>'SETUP' or r.roles_released then raise exception '역할 배포 전에 비밀 정보를 저장해 주세요.';end if;
   info:=p_data->'information';
   select string_agg(user_id::text||':'||coalesce(actual_role,'')||':'||coalesce(shown_role,''),'|' order by user_id),count(*) into roster,n from public.clocktower_live_members where room_id=r.id;
   if jsonb_typeof(info) is distinct from 'object' or info->>'roster' is distinct from roster or jsonb_typeof(info->'messages') is distinct from 'object' or jsonb_typeof(info->'grandchildren') is distinct from 'object' or octet_length(info::text)>100000 then raise exception '역할 구성이 변경되었습니다. 비밀 정보 초안을 다시 만들어 주세요.';end if;
   for m in select * from public.clocktower_live_members where room_id=r.id loop
    foreach role_key in array array['하수인 정보','악마 정보','미치광이','대부'] loop
     if (role_key='하수인 정보' and n>=7 and public.clocktower_bmr_role_kind(m.actual_role)='하수인') or (role_key='악마 정보' and public.clocktower_bmr_role_kind(m.actual_role)='악마' and (n>=7 or exists(select 1 from public.clocktower_live_members where room_id=r.id and actual_role='미치광이'))) or (role_key in ('미치광이','대부') and m.actual_role=role_key) then
      if length(btrim(coalesce(info->'messages'->>(role_key||':'||m.user_id::text),''))) not between 1 and 2000 then raise exception '참가자에게 전달할 초기 정보를 확인해 주세요.';end if;
     end if;
    end loop;
    if m.actual_role='할머니' and not exists(select 1 from public.clocktower_live_members x where x.room_id=r.id and x.user_id::text=info->'grandchildren'->>m.user_id::text and x.user_id<>m.user_id and public.clocktower_bmr_role_kind(x.actual_role) in ('주민','외지인')) then raise exception '할머니의 손주로 선한 참가자를 선택해 주세요.';end if;
   end loop;
   update public.clocktower_live_rooms set bmr_state=bmr_state||jsonb_build_object('information',info),bmr_revision=bmr_revision+1 where id=r.id;
   return;
  end if;
  if r.phase not in ('NIGHT','DAY') or not coalesce((r.bmr_state->>'automated')::boolean,false) or r.flow_revision is distinct from (p_data->>'revision')::integer or r.bmr_state->'auto' is null then raise exception '진행 중인 최신 판정 상태를 확인해 주세요.';end if;
  if coalesce((r.bmr_state->'auto'->>'executionPending')::boolean,false) or r.bmr_state->'auto'->'pending'->'op'->>'kind' in ('execution','tinker') then raise exception '진행 중인 처형 판정을 먼저 마쳐 주세요.';end if;
  if p_action='bmr_skip' then
   if r.phase<>'NIGHT' or coalesce((r.bmr_state->'auto'->>'finished')::boolean,false) or (p_data->'auto'->>'cursor')::integer is distinct from (r.bmr_state->'auto'->>'cursor')::integer+1 or p_data->'auto'->'players' is distinct from r.bmr_state->'auto'->'players' or p_data->'auto'->'effects' is distinct from r.bmr_state->'auto'->'effects' or p_data->'auto'?'waiting' or p_data->'auto'?'pending' or p_data->'auto'?'review' or p_data->'auto'->'out' is distinct from '{"notices":[]}'::jsonb or p_data->'auto'->>'phase'<>'NIGHT' or p_data->'auto'->>'night' is distinct from r.night::text then raise exception '현재 차례를 효과 없이 건너뛰어 주세요.';end if;
   update public.clocktower_live_requests set status='CANCELLED' where room_id=r.id and night=r.night and bmr_options->>'engine_key'=r.bmr_state->'auto'->'waiting'->'task'->>'key' and status in ('OPEN','SUBMITTED');
   perform public.clocktower_bmr_auto_commit(p_event_id,p_data);return;
  end if;
  if coalesce((p_data->>'cancel_request')::boolean,false) then
   if r.bmr_state->'auto'->'waiting'->'task'->>'actor' is distinct from p_data->>'user_id' then raise exception '변경 대상의 요청을 확인해 주세요.';end if;
   update public.clocktower_live_requests set status='CANCELLED' where room_id=r.id and night=r.night and bmr_options->>'engine_key'=r.bmr_state->'auto'->'waiting'->'task'->>'key' and status in ('OPEN','SUBMITTED');
  end if;
  if p_data->'auto'->>'phase' is distinct from r.bmr_state->'auto'->>'phase' or p_data->'auto'->>'night' is distinct from r.bmr_state->'auto'->>'night' or p_data->'auto'?'review' or p_data->'auto'?'pending' or p_data->'auto'->'out' is distinct from '{"notices":[]}'::jsonb then raise exception '직접 수정 중에는 단계와 능력 결과를 변경할 수 없습니다.';end if;
  perform public.clocktower_live_command_before_bmr_auto(p_event_id,'bmr_member',p_data);
  select * into r from public.clocktower_live_rooms where id=r.id;
  next_data:=p_data||jsonb_build_object('bmr_revision',r.bmr_revision,'revision',r.flow_revision);
  perform public.clocktower_bmr_auto_commit(p_event_id,next_data);
  return;
 end if;
 if r.script='BMR' and coalesce((r.bmr_state->>'automated')::boolean,false) then
  if p_action='flow_next' and r.phase='SETUP' and not r.roles_released then
   select string_agg(user_id::text||':'||coalesce(actual_role,'')||':'||coalesce(shown_role,''),'|' order by user_id) into roster from public.clocktower_live_members where room_id=r.id;
   if r.bmr_state->'information'->>'roster' is distinct from roster then raise exception '역할 저장 후 비밀 정보 초안을 확인하고 저장해 주세요.';end if;
  end if;
  if r.bmr_state->'auto'?'review' and (p_action='flow_next' or p_action like 'vote_%') then raise exception '이야기꾼이 결과를 확인하고 전달한 뒤 진행해 주세요.';end if;
  if p_action='bmr_auto_commit' then
   if r.bmr_state->'auto'?'review' and coalesce(p_data->>'operation','') not in ('approve','revise') then raise exception '검토 중인 판정을 승인하거나 다시 선택해 주세요.';end if;
   if p_data->'auto'?'review' and (p_data->'auto'->'players' is distinct from r.bmr_state->'auto'->'players' or p_data->'auto'->'effects' is distinct from r.bmr_state->'auto'->'effects' or p_data->'auto'->'out' is distinct from '{"notices":[]}'::jsonb) then raise exception '승인 전에 효과를 반영할 수 없습니다.';end if;
  end if;
 end if;
 perform public.clocktower_live_command_before_bmr_review(p_event_id,p_action,p_data);
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
