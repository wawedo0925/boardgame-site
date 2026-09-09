begin;
alter table public.clocktower_live_rooms add column night_engine jsonb not null default '{}', add column engine_version integer not null default 0;
alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_v2;
revoke all on function public.clocktower_live_snapshot_v2(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare snapshot jsonb; r public.clocktower_live_rooms;
begin
 snapshot:=public.clocktower_live_snapshot_v2(p_event_id);
 if coalesce((snapshot->>'is_host')::boolean,false) then
  select * into r from public.clocktower_live_rooms where id=(snapshot->'room'->>'id')::uuid;
  snapshot:=snapshot||jsonb_build_object('engine',r.night_engine,'engine_version',r.engine_version);
 end if;
 return snapshot;
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;

-- Storyteller-only preparation; invoked through the authenticated command below.
create function public.clocktower_validate_information(room uuid, info jsonb, herring text) returns void
language plpgsql set search_path=public as $$
declare towns text[]:=array['세탁부','사서','수사관','요리사','초공감자','점쟁이','장의사','수도사','까마귀지기','성결자','처단자','군인','시장']; outsiders text[]:=array['집사','주정뱅이','은둔자','성자']; minions text[]:=array['독살범','첩자','남작','탕녀']; signature text; item record; observer public.clocktower_live_members; target public.clocktower_live_members; clue jsonb; choices text[]; perceived text;
begin
 select string_agg(user_id::text||':'||actual_role||':'||shown_role,'|' order by user_id::text collate "C") into signature from public.clocktower_live_members where room_id=room;
 if jsonb_typeof(info) is distinct from 'object' or info->>'roster' is distinct from signature then raise exception '현재 역할 구성에 맞춰 비밀 정보를 다시 저장해 주세요.';end if;
 if jsonb_typeof(info->'bluffs') is distinct from 'array' then raise exception '블러프 3개가 필요합니다.';end if;
 if jsonb_array_length(info->'bluffs')<>3 or (select count(distinct value) from jsonb_array_elements_text(info->'bluffs'))<>3 or exists(select 1 from jsonb_array_elements_text(info->'bluffs') b where not (b.value=any(towns||outsiders)) or exists(select 1 from public.clocktower_live_members m where m.room_id=room and (m.actual_role=b.value or m.shown_role=b.value))) then raise exception '중복 없이 미사용 선한 역할 3개를 선택해 주세요.';end if;
 if not exists(select 1 from public.clocktower_live_members where room_id=room and user_id::text=herring and actual_role=any(towns||outsiders)) then raise exception '허상은 선한 참가자여야 합니다.';end if;
 if jsonb_typeof(info->'registrations') is distinct from 'object' or jsonb_typeof(info->'clues') is distinct from 'object' then raise exception '비밀 정보 형식을 확인해 주세요.';end if;
 for item in select * from jsonb_each_text(info->'registrations') loop
  if coalesce(item.value,'')<>'' and not exists(select 1 from public.clocktower_live_members where room_id=room and user_id::text=item.key and ((actual_role='은둔자' and item.value=any(minions||array['임프'])) or (actual_role='첩자' and item.value=any(towns||outsiders)))) then raise exception '위장 역할을 확인해 주세요.';end if;
 end loop;
 for observer in select * from public.clocktower_live_members where room_id=room and shown_role in ('세탁부','사서','수사관') loop
  clue:=info->'clues'->observer.user_id::text;
  if jsonb_typeof(clue) is distinct from 'object' then raise exception '초기 정보 조합이 누락되었습니다.';end if;
  if coalesce((clue->>'none')::boolean,false) then
   if observer.shown_role<>'사서' or (observer.actual_role<>'주정뱅이' and exists(select 1 from public.clocktower_live_members m where m.room_id=room and coalesce(nullif(info->'registrations'->>m.user_id::text,''),m.actual_role)=any(outsiders))) then raise exception '외지인 0명 정보를 확인해 주세요.';end if;
  else
   choices:=case observer.shown_role when '세탁부' then towns when '사서' then outsiders else minions end;
   select * into target from public.clocktower_live_members where room_id=room and user_id::text=clue->>'correct';
   if target.user_id is null or clue->>'correct'=clue->>'decoy' or not exists(select 1 from public.clocktower_live_members where room_id=room and user_id::text=clue->>'decoy') or clue->>'role' is null or not (clue->>'role'=any(choices)) then raise exception '정보를 보여줄 두 사람과 역할을 확인해 주세요.';end if;
   perceived:=coalesce(nullif(info->'registrations'->>target.user_id::text,''),target.actual_role);
   if observer.actual_role<>'주정뱅이' and perceived is distinct from clue->>'role' then raise exception '정답 대상의 실제 또는 위장 역할이 다릅니다.';end if;
  end if;
 end loop;
end $$;
revoke all on function public.clocktower_validate_information(uuid,jsonb,text) from public,anon,authenticated;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_v3;
revoke all on function public.clocktower_live_command_v3(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; q public.clocktower_live_requests; state jsonb; task jsonb; req jsonb; uid uuid; cursor_value integer; before_member public.clocktower_live_members; change jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action like 'engine_%' then
  if r.id is null or r.id::text is distinct from p_data->>'room_id' then raise exception '진행방이 바뀌었습니다.';end if;
  if r.storyteller_id is distinct from auth.uid() then raise exception '이야기꾼만 밤을 진행할 수 있습니다.';end if;
  if r.engine_version is distinct from (p_data->>'version')::integer then raise exception '선택 또는 상태가 변경되었습니다. 최신 제안을 다시 확인해 주세요.';end if;
  state:=p_data->'state';
  if state is null or jsonb_typeof(state)<>'object' or pg_column_size(state)>100000 then raise exception '밤 상태를 확인해 주세요.';end if;
  if p_action='engine_information' then
   if r.phase<>'SETUP' then raise exception '비밀 정보는 첫날 밤 전에 저장해 주세요.';end if;
   perform public.clocktower_validate_information(r.id,state->'information',state->>'red_herring');
   state:=r.night_engine||jsonb_build_object('information',state->'information','red_herring',state->'red_herring');
  elsif p_action='engine_settings' then
   if r.phase='ENDED' then raise exception '종료된 게임입니다.';end if;
   if state->>'red_herring' is not null and not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id::text=state->>'red_herring' and actual_role in ('세탁부','사서','수사관','요리사','초공감자','점쟁이','장의사','수도사','까마귀지기','성결자','처단자','군인','시장','집사','주정뱅이','은둔자','성자')) then raise exception '허상은 선한 참가자여야 합니다.';end if;
   if r.night_engine->>'red_herring' is not null and r.phase<>'SETUP' and r.night_engine->>'red_herring' is distinct from state->>'red_herring' then raise exception '허상은 게임 도중 바뀌지 않습니다.';end if;
   state:=r.night_engine||jsonb_build_object('conditions',coalesce(state->'conditions','{}'),'red_herring',state->'red_herring');
  elsif p_action='engine_execution' then
   if r.phase<>'DAY' then raise exception '낮에만 처형 결과를 기록할 수 있습니다.';end if;
   uid:=(p_data->>'user_id')::uuid;
   if uid is null then state:=r.night_engine-'execution';
   else
    select * into before_member from public.clocktower_live_members where room_id=r.id and user_id=uid;
    if before_member.user_id is null or not before_member.alive then raise exception '처형으로 사망한 생존 참가자를 선택해 주세요.';end if;
    state:=r.night_engine||jsonb_build_object('execution',jsonb_build_object('night',r.night,'user_id',uid,'role',before_member.actual_role));
    update public.clocktower_live_members set alive=false,public_alive=false where room_id=r.id and user_id=uid;
   end if;
  else
   if r.phase<>'NIGHT' or (state->>'night')::integer is distinct from r.night then raise exception '현재 밤이 아닙니다.';end if;
   if jsonb_typeof(state->'tasks') is distinct from 'array' or jsonb_array_length(state->'tasks')>60 then raise exception '밤 순서를 확인해 주세요.';end if;
   cursor_value:=(state->>'cursor')::integer;
   if cursor_value is null or cursor_value<0 or cursor_value>jsonb_array_length(state->'tasks') then raise exception '잘못된 차례입니다.';end if;
   if p_action='engine_start' then
    if (r.night_engine->>'night')::integer=r.night then raise exception '이미 이 밤을 시작했습니다.';end if;
    if exists(select 1 from public.clocktower_live_requests where room_id=r.id and (status in ('OPEN','SUBMITTED') or (status='RESOLVED' and not acknowledged))) then raise exception '기존 요청을 먼저 마무리해 주세요.';end if;
   elsif p_action in ('engine_next','engine_approve') then
    if (r.night_engine->>'night')::integer is distinct from r.night then raise exception '밤 순서를 먼저 준비해 주세요.';end if;
    if r.night_engine->>'active' is not null then
     select * into q from public.clocktower_live_requests where id=(r.night_engine->>'active')::uuid and room_id=r.id and night=r.night for update;
     if q.id is null then raise exception '현재 요청이 없습니다.';end if;
    end if;
    if p_action='engine_approve' then
     if q.id is null or q.id::text is distinct from p_data->>'request_id' or q.status<>'SUBMITTED' then raise exception '확인할 선택이 변경되었습니다.';end if;
     if cursor_value is distinct from (r.night_engine->>'cursor')::integer then raise exception '차례가 변경되었습니다.';end if;
     if length(trim(coalesce(p_data->>'result',''))) not between 1 and 2000 then raise exception '전달할 결과를 확인해 주세요.';end if;
     for change in select value from jsonb_array_elements(coalesce(p_data->'changes','[]')) loop
      if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id::text=change->>'user_id') then raise exception '참가자가 아닙니다.';end if;
      if change->>'actual_role' is null or change->>'shown_role' is null or jsonb_typeof(change->'alive') is distinct from 'boolean' then raise exception '상태 변경을 확인해 주세요.';end if;
      update public.clocktower_live_members set alive=(change->>'alive')::boolean,actual_role=change->>'actual_role',shown_role=change->>'shown_role' where room_id=r.id and user_id::text=change->>'user_id';
     end loop;
     update public.clocktower_live_requests set status='RESOLVED',result=trim(p_data->>'result'),acknowledged=false where id=q.id;
     state:=state||jsonb_build_object('active',q.id);
    else
     if q.id is not null and not (q.status='CANCELLED' or (q.status='RESOLVED' and q.acknowledged)) then raise exception '현재 결과 전달과 확인을 먼저 완료해 주세요.';end if;
     if cursor_value<coalesce((r.night_engine->>'cursor')::integer,0)+(case when q.id is null then 0 else 1 end) then raise exception '이미 처리한 차례입니다.';end if;
     state:=state-'active'; req:=p_data->'request';
     if req is not null and req<>'null'::jsonb then
      task:=state->'tasks'->cursor_value;
      if task is null or task->>'user_id' is distinct from req->>'user_id' then raise exception '현재 순서의 참가자만 요청할 수 있습니다.';end if;
      insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,allow_self,status) values(r.id,(req->>'user_id')::uuid,r.night,req->>'prompt',(req->>'target_count')::integer,coalesce((req->>'allow_self')::boolean,true),case when (req->>'target_count')::integer=0 then 'SUBMITTED' else 'OPEN' end) returning id into uid;
      state:=state||jsonb_build_object('active',uid);
     elsif cursor_value<>jsonb_array_length(state->'tasks') then raise exception '다음 요청이 필요합니다.';end if;
    end if;
   else raise exception '알 수 없는 밤 작업입니다.';end if;
  end if;
  update public.clocktower_live_rooms set night_engine=state,engine_version=engine_version+1 where id=r.id;
  return;
 end if;
 if p_action='phase' and p_data->>'phase'='NIGHT' and r.phase='SETUP' then
  perform public.clocktower_validate_information(r.id,r.night_engine->'information',r.night_engine->>'red_herring');
 end if;
 if p_action='phase' and p_data->>'phase'='DAY' and r.phase='NIGHT' and ((r.night_engine->>'night')::integer is distinct from r.night or not coalesce((r.night_engine->>'finished')::boolean,false)) then raise exception '밤 시트의 모든 차례를 먼저 완료해 주세요.';end if;
 if p_action in ('request','resolve') and r.phase='NIGHT' and (r.night_engine->>'night')::integer=r.night then raise exception '자동 밤 순서 화면에서 진행해 주세요.';end if;
 if p_action='member' then select * into before_member from public.clocktower_live_members where room_id=r.id and user_id=(p_data->>'user_id')::uuid;end if;
 perform public.clocktower_live_command_v3(p_event_id,p_action,p_data);
 if p_action='member' and before_member.user_id is not null then
  if before_member.alive and coalesce((p_data->>'alive')::boolean,true)=false and r.phase='NIGHT' then
   update public.clocktower_live_rooms set night_engine=jsonb_set(night_engine,'{deaths}',coalesce(night_engine->'deaths','{}')||jsonb_build_object(before_member.user_id::text,jsonb_build_object('night',r.night,'role',before_member.shown_role))) where id=r.id;
  end if;
  if before_member.actual_role is distinct from p_data->>'actual_role' and r.phase<>'SETUP' then
   update public.clocktower_live_rooms set night_engine=jsonb_set(night_engine,'{notices}',coalesce(night_engine->'notices','[]')||jsonb_build_array(before_member.user_id)) where id=r.id;
  end if;
 end if;
 update public.clocktower_live_rooms set engine_version=engine_version+1 where event_id=p_event_id and phase<>'ENDED';
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
