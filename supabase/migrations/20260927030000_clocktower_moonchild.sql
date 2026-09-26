begin;
create table public.clocktower_moon_bluffs (
 room_id uuid references public.clocktower_live_rooms(id) on delete cascade,
 user_id uuid references auth.users(id), enabled boolean not null default false, primary key(room_id,user_id)
);
create table public.clocktower_moon_choices (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.clocktower_live_rooms(id) on delete cascade,
 actor uuid not null references auth.users(id), day integer not null, real_ability boolean not null,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '2 minutes',
 status text not null default 'OPEN' check(status in ('OPEN','DONE','EXPIRED','CANCELLED')),
 target uuid references auth.users(id), chosen_at timestamptz
);
create unique index clocktower_moon_one_open on public.clocktower_moon_choices(room_id,actor) where status='OPEN';
create table public.clocktower_moon_reads (
 choice_id uuid references public.clocktower_moon_choices(id) on delete cascade, user_id uuid references auth.users(id), primary key(choice_id,user_id)
);
alter table public.clocktower_moon_bluffs enable row level security;
alter table public.clocktower_moon_choices enable row level security;
alter table public.clocktower_moon_reads enable row level security;
revoke all on public.clocktower_moon_bluffs,public.clocktower_moon_choices,public.clocktower_moon_reads from public,anon,authenticated;

-- Only public life transitions open a timer. Hidden night deaths do not notify anyone.
create function public.clocktower_moon_public_death() returns trigger language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms;
begin
 select * into r from public.clocktower_live_rooms where id=new.room_id;
 if r.script<>'BMR' or r.phase not in ('DAY','NIGHT') then return new;end if;
 if not old.public_alive and new.public_alive then
  update public.clocktower_moon_choices set status='CANCELLED' where room_id=r.id and actor=new.user_id and status='OPEN';
 elsif old.public_alive and not new.public_alive and (new.actual_role='달의 자손' or exists(select 1 from public.clocktower_moon_bluffs where room_id=r.id and user_id=new.user_id and enabled)) then
  insert into public.clocktower_moon_choices(room_id,actor,day,real_ability) values(r.id,new.user_id,r.night,new.actual_role='달의 자손');
 end if;
 return new;
end $$;
revoke all on function public.clocktower_moon_public_death() from public,anon,authenticated;
create trigger clocktower_moon_public_death after update of public_alive on public.clocktower_live_members for each row execute function public.clocktower_moon_public_death();

alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_before_moon;
revoke all on function public.clocktower_live_snapshot_before_moon(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; r public.clocktower_live_rooms; rows jsonb;
begin
 s:=public.clocktower_live_snapshot_before_moon(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select * into r from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
 if r.script='BMR' then
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'actor',c.actor,'day',c.day,'target',c.target,'status',c.status,'expires_at',c.expires_at,
   'acknowledged',exists(select 1 from public.clocktower_moon_reads a where a.choice_id=c.id and a.user_id=auth.uid()))
   ||case when r.storyteller_id=auth.uid() then jsonb_build_object('real_ability',c.real_ability) else '{}'::jsonb end order by coalesce(c.chosen_at,c.created_at),c.id),'[]') into rows
  from public.clocktower_moon_choices c where c.room_id=r.id and (c.status='DONE' or c.actor=auth.uid() or r.storyteller_id=auth.uid());
  s:=s||jsonb_build_object('moon_choices',rows,'moon_bluff_enabled',exists(select 1 from public.clocktower_moon_bluffs where room_id=r.id and user_id=auth.uid() and enabled));
 end if;
 return s;
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_before_moon;
revoke all on function public.clocktower_live_command_before_moon(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; c public.clocktower_moon_choices; m public.clocktower_live_members; target_member public.clocktower_live_members; flags jsonb; next_auto jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action in ('moon_bluff','moon_choose','moon_ack','moon_expire') then
  if r.id is null or r.id::text is distinct from p_data->>'room_id' or r.script<>'BMR' then raise exception '현재 피로 물든 달 방에서만 가능합니다.';end if;
  if r.storyteller_id<>auth.uid() and not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=auth.uid()) then raise exception '참가자만 사용할 수 있습니다.';end if;
  if p_action='moon_bluff' then
   select * into m from public.clocktower_live_members where room_id=r.id and user_id=auth.uid();
   if m.user_id is null or not m.public_alive or r.phase not in ('SETUP','DAY') or not r.roles_released or r.bmr_state->'auto'?'pending' then raise exception '역할 공개 후 살아 있을 때 준비 단계나 낮에 설정하세요.';end if;
   if m.actual_role='달의 자손' then raise exception '진짜 달의 자손은 자동으로 안내됩니다.';end if;
   if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception '설정을 확인하세요.';end if;
   insert into public.clocktower_moon_bluffs values(r.id,auth.uid(),(p_data->>'enabled')::boolean) on conflict(room_id,user_id) do update set enabled=excluded.enabled;
   select coalesce(jsonb_object_agg(user_id::text,enabled),'{}') into flags from public.clocktower_moon_bluffs where room_id=r.id;
   update public.clocktower_live_rooms set bmr_state=case when bmr_state?'auto' then jsonb_set(bmr_state,'{auto,moonBluffs}',flags) else bmr_state end,bmr_revision=bmr_revision+1 where id=r.id;return;
  end if;
  if p_action='moon_expire' then
   if r.storyteller_id<>auth.uid() or r.phase<>'DAY' or r.bmr_state->'auto'?'pending' then raise exception '낮에 이야기꾼이 처리할 수 있습니다.';end if;
   for c in select * from public.clocktower_moon_choices where room_id=r.id and status='OPEN' and expires_at<=clock_timestamp() loop
    update public.clocktower_moon_choices set status='EXPIRED' where id=c.id;
    if r.bmr_state?'auto' then update public.clocktower_live_rooms set bmr_state=jsonb_set(bmr_state,'{auto,moon}',coalesce(bmr_state->'auto'->'moon','{}')-c.actor::text),bmr_revision=bmr_revision+1 where id=r.id;end if;
   end loop;return;
  end if;
  select * into c from public.clocktower_moon_choices where room_id=r.id and id=(p_data->>'choice_id')::uuid for update;
  if c.id is null then raise exception '선택 요청을 찾을 수 없습니다.';end if;
  if p_action='moon_ack' then
   if c.status<>'DONE' then raise exception '공개된 선택이 아닙니다.';end if;
   insert into public.clocktower_moon_reads values(c.id,auth.uid()) on conflict do nothing;return;
  end if;
  if c.actor<>auth.uid() and r.storyteller_id<>auth.uid() then raise exception '본인만 대상을 선택할 수 있습니다.';end if;
  if r.phase<>'DAY' or c.status<>'OPEN' or c.expires_at<=clock_timestamp() or r.bmr_state->'auto'?'pending' then raise exception '선택 시간이 끝났거나 이미 처리되었습니다.';end if;
  select * into target_member from public.clocktower_live_members where room_id=r.id and user_id=(p_data->>'target')::uuid;
  if target_member.user_id is null or not target_member.public_alive then raise exception '현재 생존한 참가자를 선택하세요.';end if;
  update public.clocktower_moon_choices set status='DONE',target=target_member.user_id,chosen_at=clock_timestamp() where id=c.id;
  if r.bmr_state?'auto' then
   if c.real_ability then
    update public.clocktower_live_rooms set bmr_state=jsonb_set(bmr_state,array['auto','moon',c.actor::text],jsonb_build_object('due',r.night+1,'target',target_member.user_id,'good',target_member.bmr->>'faction'='GOOD')) where id=r.id;
   else update public.clocktower_live_rooms set bmr_state=jsonb_set(bmr_state,'{auto,moon}',coalesce(bmr_state->'auto'->'moon','{}')-c.actor::text) where id=r.id;end if;
  end if;
  update public.clocktower_live_rooms set bmr_revision=bmr_revision+1 where id=r.id;return;
 end if;
 if r.script='BMR' then
  if r.phase='DAY' and ((p_action='bmr_auto_commit' and (p_data->>'operation'='execution' or p_data->'auto'->>'phase'='NIGHT')) or (p_action='flow_next' and r.day_stage='NOMINATIONS'))
   and exists(select 1 from public.clocktower_moon_choices where room_id=r.id and status='OPEN') then raise exception '달의 자손 공개 선택을 기다려 주세요.';end if;
  if r.bmr_state->'auto'->>'executionPending'='true' and (p_action like 'vote_%' or p_action='gossip_declare') then raise exception '오늘 처형은 이미 끝났습니다.';end if;
  if p_action='bmr_auto_commit' then
   next_auto:=p_data->'auto';
   select coalesce(jsonb_object_agg(user_id::text,enabled),'{}') into flags from public.clocktower_moon_bluffs where room_id=r.id;
   next_auto:=jsonb_set(next_auto,'{moonBluffs}',flags);
   if r.phase='DAY' and next_auto->>'phase'='NIGHT' and exists(select 1 from jsonb_array_elements(next_auto->'players') p join public.clocktower_live_members member_row on member_row.room_id=r.id and member_row.user_id::text=p->>'id' where member_row.public_alive and p->>'life'<>'ALIVE' and (member_row.actual_role='달의 자손' or flags->>member_row.user_id::text='true')) then raise exception '달의 자손 선택 시간이 필요합니다. 새로고침한 뒤 진행하세요.';end if;
   -- The public choice RPC owns target registration. The reducer may create pending deaths or consume effects.
   if r.phase='DAY' and exists(select 1 from jsonb_each(coalesce(next_auto->'moon','{}')) n where n.value?'target' and n.value is distinct from r.bmr_state->'auto'->'moon'->n.key) then raise exception '달의 자손 공개 선택 화면을 이용해 주세요.';end if;
   p_data:=jsonb_set(p_data,'{auto}',next_auto);
  end if;
 end if;
 perform public.clocktower_live_command_before_moon(p_event_id,p_action,p_data);
 if exists(select 1 from public.clocktower_live_rooms where id=r.id and phase='ENDED') then update public.clocktower_moon_choices set status='CANCELLED' where room_id=r.id and status='OPEN';end if;
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
