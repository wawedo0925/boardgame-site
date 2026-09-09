begin;

-- These tables deliberately have no client SELECT policies. Only the masked
-- snapshot and validated command functions below expose game information.
create table public.clocktower_live_rooms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  storyteller_id uuid not null references auth.users(id),
  phase text not null default 'SETUP' check (phase in ('SETUP','NIGHT','DAY','ENDED')),
  night integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index clocktower_one_live_room on public.clocktower_live_rooms(event_id) where phase <> 'ENDED';
create table public.clocktower_live_members (
  room_id uuid not null references public.clocktower_live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  seat integer not null check (seat between 1 and 20),
  actual_role text not null,
  shown_role text not null,
  alive boolean not null default true,
  public_alive boolean not null default true,
  notes text not null default '' check (length(notes) <= 2000),
  primary key(room_id,user_id), unique(room_id,seat)
);
create table public.clocktower_live_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.clocktower_live_rooms(id) on delete cascade,
  user_id uuid not null,
  night integer not null,
  prompt text not null check(length(prompt) between 1 and 2000),
  target_count integer not null check(target_count between 0 and 2),
  allow_self boolean not null default true,
  status text not null default 'OPEN' check(status in ('OPEN','SUBMITTED','RESOLVED','CANCELLED')),
  targets uuid[] not null default '{}',
  result text not null default '',
  acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(room_id,user_id) references public.clocktower_live_members(room_id,user_id)
);
create unique index clocktower_one_request_per_member on public.clocktower_live_requests(room_id,user_id) where status in ('OPEN','SUBMITTED');
alter table public.clocktower_live_rooms enable row level security;
alter table public.clocktower_live_members enable row level security;
alter table public.clocktower_live_requests enable row level security;
revoke all on public.clocktower_live_rooms,public.clocktower_live_members,public.clocktower_live_requests from public,anon,authenticated;

create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; host boolean; result jsonb; roster jsonb; candidates jsonb;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1;
  if r.id is null then
    return jsonb_build_object('room',null,'can_create',coalesce(public.can_operate_event(p_event_id),false));
  end if;
  host := r.storyteller_id=auth.uid();
  if not host and not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=auth.uid()) then
    return jsonb_build_object('room',null,'can_create',false,'waiting',true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(p.activity_name,'회원'),'seat',m.seat,
    'alive',case when host then m.alive else m.public_alive end) ||
    case when host then jsonb_build_object('actual_role',m.actual_role,'shown_role',m.shown_role,'notes',m.notes)
    when m.user_id=auth.uid() and r.phase<>'SETUP' then jsonb_build_object('shown_role',m.shown_role)
    else '{}'::jsonb end order by m.seat),'[]'::jsonb) into roster
  from public.clocktower_live_members m left join public.profiles p on p.id=m.user_id where m.room_id=r.id;
  if host then
    select coalesce(jsonb_agg(jsonb_build_object('user_id',ep.user_id,'name',coalesce(p.activity_name,'회원')) order by p.activity_name),'[]'::jsonb) into candidates
    from public.event_participants ep left join public.profiles p on p.id=ep.user_id where ep.event_id=p_event_id and ep.user_id<>r.storyteller_id;
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into result
  from public.clocktower_live_requests q where q.room_id=r.id and (host or q.user_id=auth.uid());
  return jsonb_build_object('room',jsonb_build_object('id',r.id,'phase',r.phase,'night',r.night),'is_host',host,
    'my_id',auth.uid(),'members',roster,'requests',result,'candidates',coalesce(candidates,'[]'::jsonb));
end $$;

create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; q public.clocktower_live_requests; uid uuid; actual text; shown text; next_phase text; picked uuid[]; n integer;
  towns text[] := array['세탁부','사서','수사관','요리사','초공감자','점쟁이','장의사','수도사','까마귀지기','성결자','처단자','군인','시장'];
  roles text[] := towns || array['집사','주정뱅이','은둔자','성자','독살범','첩자','남작','탕녀','임프'];
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  -- Serialize room creation and all subsequent transitions for this event.
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
  if p_action='create' then
    if not coalesce(public.can_operate_event(p_event_id),false) then raise exception '진행방을 만들 권한이 없습니다.'; end if;
    if not exists(select 1 from public.events where id=p_event_id and event_kind='CLOCKTOWER' and event_status='OPEN') then raise exception '진행 가능한 시계탑 이벤트가 아닙니다.'; end if;
    if exists(select 1 from public.clocktower_live_rooms where event_id=p_event_id and phase<>'ENDED') then raise exception '이미 진행방이 있습니다.'; end if;
    insert into public.clocktower_live_rooms(event_id,storyteller_id) values(p_event_id,auth.uid());
    return;
  end if;
  select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
  if r.id is null or r.id::text is distinct from p_data->>'room_id' then raise exception '진행방이 바뀌었습니다. 새로고침해 주세요.'; end if;
  if p_action='reply' or p_action='ack' then
    select * into q from public.clocktower_live_requests where id=(p_data->>'request_id')::uuid and room_id=r.id and user_id=auth.uid() for update;
    if q.id is null then raise exception '본인에게 온 요청만 처리할 수 있습니다.'; end if;
    if p_action='ack' then
      if q.status<>'RESOLVED' then raise exception '확인할 결과가 없습니다.'; end if;
      update public.clocktower_live_requests set acknowledged=true where id=q.id; return;
    end if;
    if r.phase<>'NIGHT' or q.night<>r.night or q.status<>'OPEN' then raise exception '현재 선택할 수 없는 요청입니다.'; end if;
    select coalesce(array_agg(value::uuid),'{}') into picked from jsonb_array_elements_text(coalesce(p_data->'targets','[]'));
    if cardinality(picked)<>q.target_count or cardinality(picked)<>(select count(distinct x) from unnest(picked) x) then raise exception '지정된 인원수를 중복 없이 선택해 주세요.'; end if;
    if exists(select 1 from unnest(picked) x where not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=x)) then raise exception '게임 참가자만 선택할 수 있습니다.'; end if;
    if not q.allow_self and auth.uid()=any(picked) then raise exception '본인은 선택할 수 없습니다.'; end if;
    update public.clocktower_live_requests set targets=picked,status=case when q.target_count=0 then 'RESOLVED' else 'SUBMITTED' end,acknowledged=(q.target_count=0),result=case when q.target_count=0 then '정보 확인 완료' else '' end where id=q.id; return;
  end if;
  if r.storyteller_id<>auth.uid() then raise exception '이야기꾼만 진행할 수 있습니다.'; end if;
  if r.phase='ENDED' then raise exception '종료된 게임입니다. 새 진행방을 만들어 주세요.'; end if;
  if p_action='member' then
    uid := (p_data->>'user_id')::uuid; actual:=p_data->>'actual_role'; shown:=p_data->>'shown_role';
    if uid is null or uid=r.storyteller_id or not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=uid) then raise exception '이벤트 참가자를 선택해 주세요. 이야기꾼은 플레이어에 포함되지 않습니다.'; end if;
    if actual is null or not(actual=any(roles)) or shown is null or not(shown=any(roles)) or (actual='주정뱅이' and not(shown=any(towns))) or (actual<>'주정뱅이' and shown<>actual) then raise exception '실제 역할과 공개할 역할을 확인해 주세요.'; end if;
    if r.phase<>'SETUP' and not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=uid) then raise exception '게임 시작 후에는 새 참가자를 추가할 수 없습니다.'; end if;
    if r.phase='SETUP' and exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id<>uid and (actual_role=actual or shown_role=shown)) then raise exception '이미 배정한 역할입니다.'; end if;
    insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role,notes,alive)
    values(r.id,uid,(p_data->>'seat')::integer,actual,shown,coalesce(p_data->>'notes',''),coalesce((p_data->>'alive')::boolean,true))
    on conflict(room_id,user_id) do update set seat=excluded.seat,actual_role=excluded.actual_role,shown_role=excluded.shown_role,notes=excluded.notes,alive=excluded.alive;
    if r.phase in ('SETUP','DAY') then update public.clocktower_live_members set public_alive=alive where room_id=r.id and user_id=uid; end if;
  elsif p_action='remove_member' then
    if r.phase<>'SETUP' then raise exception '시작 전만 배정을 해제할 수 있습니다.'; end if;
    delete from public.clocktower_live_members where room_id=r.id and user_id=(p_data->>'user_id')::uuid;
  elsif p_action='phase' then
    next_phase:=p_data->>'phase';
    if next_phase='ENDED' then
      update public.clocktower_live_requests set status='CANCELLED' where room_id=r.id and status in ('OPEN','SUBMITTED');
    elsif next_phase='NIGHT' and r.phase in ('SETUP','DAY') then
      select count(*) into n from public.clocktower_live_members where room_id=r.id;
      if n<5 or n>15 then raise exception '플레이어 5~15명을 배정해 주세요.'; end if;
    elsif next_phase='DAY' and r.phase='NIGHT' then
      if exists(select 1 from public.clocktower_live_requests where room_id=r.id and (status in ('OPEN','SUBMITTED') or (status='RESOLVED' and not acknowledged))) then raise exception '미처리 요청과 미확인 결과를 먼저 확인해 주세요.'; end if;
      update public.clocktower_live_members set public_alive=alive where room_id=r.id;
    else raise exception '가능하지 않은 단계 변경입니다.';
    end if;
    update public.clocktower_live_rooms set phase=next_phase,night=night+case when next_phase='NIGHT' then 1 else 0 end where id=r.id;
  elsif p_action='request' then
    if r.phase<>'NIGHT' then raise exception '밤에만 요청을 보낼 수 있습니다.'; end if;
    if (p_data->>'night')::integer is distinct from r.night then raise exception '밤이 바뀌었습니다. 다시 확인해 주세요.'; end if;
    insert into public.clocktower_live_requests(room_id,user_id,night,prompt,target_count,allow_self)
    values(r.id,(p_data->>'user_id')::uuid,r.night,trim(p_data->>'prompt'),(p_data->>'target_count')::integer,coalesce((p_data->>'allow_self')::boolean,true));
  elsif p_action in ('resolve','cancel','ack_offline') then
    select * into q from public.clocktower_live_requests where id=(p_data->>'request_id')::uuid and room_id=r.id for update;
    if q.id is null then raise exception '요청이 없습니다.'; end if;
    if p_action='cancel' then
      if q.status='CANCELLED' then return; end if;
      update public.clocktower_live_requests set status='CANCELLED' where id=q.id;
    elsif p_action='ack_offline' then
      if q.status<>'RESOLVED' then raise exception '완료된 결과만 확인 처리할 수 있습니다.'; end if;
      update public.clocktower_live_requests set acknowledged=true where id=q.id;
    else
      if q.status<>'SUBMITTED' or q.night<>r.night or r.phase<>'NIGHT' then raise exception '제출된 요청만 처리할 수 있습니다.'; end if;
      if length(trim(coalesce(p_data->>'result',''))) not between 1 and 2000 then raise exception '전달할 결과를 입력해 주세요.'; end if;
      update public.clocktower_live_requests set status='RESOLVED',result=trim(p_data->>'result') where id=q.id;
    end if;
  else raise exception '알 수 없는 작업입니다.';
  end if;
end $$;
revoke all on function public.clocktower_live_snapshot(uuid),public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid),public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
