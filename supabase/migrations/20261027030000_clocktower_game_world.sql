begin;

create table public.clocktower_world_settings(id boolean primary key default true check(id),enabled boolean not null default true);
insert into public.clocktower_world_settings values(true,true);
alter table public.clocktower_world_settings enable row level security;
revoke all on public.clocktower_world_settings from public,anon,authenticated;
create function public.clocktower_world_enabled() returns boolean language sql stable security definer set search_path=public as $$select coalesce((select enabled from public.clocktower_world_settings where id),false)$$;
revoke all on function public.clocktower_world_enabled() from public;
grant execute on function public.clocktower_world_enabled() to anon,authenticated;
create function public.set_clocktower_world_enabled(p_enabled boolean) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not coalesce(public.is_main_admin(),false) then raise exception '메인 관리자만 변경할 수 있습니다.';end if;
 if p_enabled is null then raise exception '노출 여부를 선택해 주세요.';end if;
 update public.clocktower_world_settings set enabled=p_enabled where id;return p_enabled;
end $$;
revoke all on function public.set_clocktower_world_enabled(boolean) from public,anon;
grant execute on function public.set_clocktower_world_enabled(boolean) to authenticated;

-- A world room is independent of events, attendance, payments and event results.
-- Existing engine APIs retain their argument names but look up a common scope.
alter table public.clocktower_live_rooms alter column event_id drop not null;
alter table public.clocktower_live_rooms add column world_title text,
 add column scope_id uuid generated always as(coalesce(event_id,id)) stored,
 add constraint clocktower_room_origin check((event_id is not null and world_title is null) or (event_id is null and length(btrim(world_title)) between 1 and 80 and world_title is not null));
create index clocktower_scope_lookup on public.clocktower_live_rooms(scope_id,created_at desc,id desc);

create function public.clocktower_scope_participants(p_scope uuid) returns table(event_id uuid,user_id uuid)
language sql stable security definer set search_path=public as $$
 select ep.event_id,ep.user_id from public.event_participants ep where ep.event_id=p_scope
 union all select r.id,m.user_id from public.clocktower_live_rooms r join public.clocktower_live_members m on m.room_id=r.id where r.id=p_scope and r.event_id is null;
$$;
revoke all on function public.clocktower_scope_participants(uuid) from public,anon,authenticated;

-- Preserve the existing validated command chain and masked snapshots for both origins.
do $$ declare f record; definition text; changed integer:=0;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'clocktower_live_command%' or p.proname like 'clocktower_live_snapshot%' or p.proname in ('clocktower_save_layout','clocktower_bmr_auto_commit')) loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'from public.clocktower_live_rooms where event_id=p_event_id','from public.clocktower_live_rooms where scope_id=p_event_id');
  definition:=replace(definition,'where event_id=p_event_id and phase','where scope_id=p_event_id and phase');
  definition:=replace(definition,'where event_id=p_event_id and script','where scope_id=p_event_id and script');
  definition:=replace(definition,'from public.event_participants ep','from public.clocktower_scope_participants(p_event_id) ep');
  definition:=replace(definition,'from public.event_participants where event_id=p_event_id','from public.clocktower_scope_participants(p_event_id) where event_id=p_event_id');
  if definition<>pg_get_functiondef(f.oid) then execute definition;changed:=changed+1;end if;
 end loop;
 if changed<10 then raise exception '시계탑 공통 진행 함수 구성을 확인해 주세요.';end if;
 -- World games retain their room winner/recap without creating an event record.
 definition:=pg_get_functiondef('public.clocktower_save_finished_result(uuid)'::regprocedure);
 if position('if r.id is null' in definition)=0 then raise exception '결과 저장 함수 구성을 확인해 주세요.';end if;
 definition:=replace(definition,'if r.id is null','if r.event_id is null then return null;end if;'||chr(10)||' if r.id is null');
 execute definition;
end $$;

create function public.clocktower_world_rooms(p_action text default 'list',p_room_id uuid default null,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; rid uuid; position integer; title text; enabled boolean; rows jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise exception '회원 로그인 후 이용해 주세요.';end if;
 enabled:=public.clocktower_world_enabled();
 if p_action='create' then
  if not enabled then raise exception '현재 게임월드 시계탑은 준비 중입니다.';end if;
  perform pg_advisory_xact_lock(hashtextextended('clocktower-world:'||auth.uid()::text,0));
  if (select count(*) from public.clocktower_live_rooms where event_id is null and storyteller_id=auth.uid() and phase<>'ENDED')>=3 then raise exception '기존 방을 마친 뒤 새 방을 만들어 주세요. 최대 3개까지 열 수 있습니다.';end if;
  title:=btrim(coalesce(p_data->>'title',''));if length(title) not between 1 and 80 then raise exception '방 이름을 1~80자로 입력해 주세요.';end if;
  if coalesce(p_data->>'script','') not in ('TB','BMR') then raise exception '시나리오를 선택해 주세요.';end if;
  insert into public.clocktower_live_rooms(storyteller_id,world_title,script,bmr_state)
   values(auth.uid(),title,p_data->>'script','{"cursor":0,"notes":"","completed":false,"history":[],"automated":true}') returning id into rid;
  return jsonb_build_object('id',rid);
 elsif p_action in ('join','leave','close','details') then
  perform pg_advisory_xact_lock(hashtextextended(p_room_id::text,0));
  select * into r from public.clocktower_live_rooms where id=p_room_id and event_id is null for update;
  if r.id is null then raise exception '방을 찾을 수 없습니다.';end if;
  if p_action='join' then
   if r.storyteller_id=auth.uid() or exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=auth.uid()) then return jsonb_build_object('id',r.id);end if;
   if not enabled then raise exception '현재 새로운 입장은 중단되었습니다.';end if;
   if r.phase<>'SETUP' or r.roles_released then raise exception '역할 배포 전 준비 중인 방만 입장할 수 있습니다.';end if;
   if (select count(*) from public.clocktower_live_members where room_id=r.id)>=15 then raise exception '참가 인원 15명이 가득 찼습니다.';end if;
   select s into position from generate_series(1,15) s where not exists(select 1 from public.clocktower_live_members where room_id=r.id and seat=s) order by s limit 1;
   insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role) values(r.id,auth.uid(),position,'','');
   update public.clocktower_live_rooms set seating_revision=seating_revision+1,engine_version=engine_version+1,bmr_revision=bmr_revision+1,flow_revision=flow_revision+1 where id=r.id;
  elsif p_action='leave' then
   if r.storyteller_id=auth.uid() then raise exception '이야기꾼은 준비방 닫기를 이용해 주세요.';end if;
   if r.phase<>'SETUP' or r.roles_released then raise exception '게임 시작 후에는 참가를 취소할 수 없습니다. 화면을 나가도 다시 접속할 수 있습니다.';end if;
   delete from public.clocktower_live_members where room_id=r.id and user_id=auth.uid();
   update public.clocktower_live_rooms set seating_layout=seating_layout-auth.uid()::text,seating_revision=seating_revision+1,engine_version=engine_version+1,bmr_revision=bmr_revision+1,flow_revision=flow_revision+1 where id=r.id;
  elsif p_action='close' then
   if r.storyteller_id<>auth.uid() then raise exception '방을 만든 이야기꾼만 닫을 수 있습니다.';end if;
   if r.phase<>'SETUP' then raise exception '준비 중인 방만 닫을 수 있습니다.';end if;
   update public.clocktower_live_rooms set phase='ENDED',end_reason='이야기꾼이 준비방을 닫았습니다.',flow_revision=flow_revision+1 where id=r.id;
  elsif r.storyteller_id<>auth.uid() and not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=auth.uid()) then
   raise exception '대기실에서 방에 입장해 주세요.';
  end if;
  return jsonb_build_object('id',r.id,'title',r.world_title,'host',r.storyteller_id=auth.uid(),'phase',r.phase,'roles_released',r.roles_released);
 elsif p_action<>'list' then raise exception '지원하지 않는 동작입니다.';end if;
 select coalesce(jsonb_agg(x order by x.created_at desc),'[]') into rows from (
  select wr.id,wr.world_title as title,wr.script,wr.phase,wr.roles_released,wr.created_at,coalesce(p.activity_name,'이야기꾼') as host_name,
   wr.storyteller_id=auth.uid() as is_host,exists(select 1 from public.clocktower_live_members where room_id=wr.id and user_id=auth.uid()) as joined,
   (select count(*) from public.clocktower_live_members where room_id=wr.id) as members
  from public.clocktower_live_rooms wr left join public.profiles p on p.id=wr.storyteller_id
  where wr.event_id is null and (wr.phase<>'ENDED' or wr.created_at>now()-interval '7 days')
   and ((enabled and wr.phase<>'ENDED') or wr.storyteller_id=auth.uid() or exists(select 1 from public.clocktower_live_members where room_id=wr.id and user_id=auth.uid()))
  order by wr.created_at desc limit 100
 ) x;
 return jsonb_build_object('enabled',enabled,'rooms',rows);
end $$;
revoke all on function public.clocktower_world_rooms(text,uuid,jsonb) from public,anon;
grant execute on function public.clocktower_world_rooms(text,uuid,jsonb) to authenticated;
commit;
