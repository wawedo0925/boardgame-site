begin;
alter table public.clocktower_moon_choices alter column expires_at set default clock_timestamp()+interval '1 minute';
alter table public.clocktower_gossip add column deferred boolean not null default false;
create or replace function public.clocktower_live_snapshot_before_moon(p_event_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; r public.clocktower_live_rooms; declarations jsonb;
begin
 s:=public.clocktower_live_snapshot_before_gossip(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select * into r from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
 if r.script='BMR' then
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'actor',g.actor,'day',g.day,'statement',g.statement,
   'acknowledged',exists(select 1 from public.clocktower_gossip_reads a where a.declaration_id=g.id and a.user_id=auth.uid()))
   ||case when r.storyteller_id=auth.uid() then jsonb_build_object('truth',g.truth,'deferred',g.deferred and g.truth is null) else '{}'::jsonb end order by g.created_at,g.id),'[]') into declarations
  from public.clocktower_gossip g where g.room_id=r.id;
  s:=s||jsonb_build_object('gossip_declarations',declarations);
 end if;
 return s;
end $$;
create or replace function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; c public.clocktower_moon_choices; m public.clocktower_live_members; target_member public.clocktower_live_members; flags jsonb; next_auto jsonb; g public.clocktower_gossip;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action in ('moon_bluff','moon_choose','moon_ack','moon_expire','moon_extend') then
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
  select * into c from public.clocktower_moon_choices where room_id=r.id and id=(p_data->>'choice_id')::uuid for update;
  if c.id is null then raise exception '선택 요청을 찾을 수 없습니다.';end if;
  if p_action in ('moon_expire','moon_extend') then
   if r.storyteller_id<>auth.uid() or r.phase<>'DAY' or r.bmr_state->'auto'?'pending' then raise exception '낮에 이야기꾼이 처리할 수 있습니다.';end if;
   if c.status<>'OPEN' or c.expires_at>clock_timestamp() or c.expires_at is distinct from (p_data->>'expires_at')::timestamptz then raise exception '선택 상태가 변경되었습니다. 새로고침해 주세요.';end if;
   if p_action='moon_extend' then
    update public.clocktower_moon_choices set expires_at=clock_timestamp()+interval '30 seconds' where id=c.id;
   else
    update public.clocktower_moon_choices set status='EXPIRED' where id=c.id;
    if r.bmr_state?'auto' then update public.clocktower_live_rooms set bmr_state=jsonb_set(bmr_state,'{auto,moon}',coalesce(bmr_state->'auto'->'moon','{}')-c.actor::text) where id=r.id;end if;
   end if;
   update public.clocktower_live_rooms set bmr_revision=bmr_revision+1 where id=r.id;return;
  end if;

  if p_action='moon_ack' then
   if c.status<>'DONE' then raise exception '공개된 선택이 아닙니다.';end if;
   insert into public.clocktower_moon_reads values(c.id,auth.uid()) on conflict do nothing;return;
  end if;
  if c.actor<>auth.uid() and r.storyteller_id<>auth.uid() then raise exception '본인만 대상을 선택할 수 있습니다.';end if;
  if r.phase<>'DAY' or c.status<>'OPEN' or (c.expires_at<=clock_timestamp() and r.storyteller_id<>auth.uid()) or r.bmr_state->'auto'?'pending' then raise exception '선택 시간이 끝났거나 이미 처리되었습니다.';end if;
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
 if p_action='gossip_defer' then
  if r.id is null or r.id::text is distinct from p_data->>'room_id' or r.storyteller_id<>auth.uid() or r.script<>'BMR' or r.phase<>'DAY' or (p_data->>'day')::integer is distinct from r.night or r.bmr_state->'auto'?'pending' then raise exception '현재 낮의 이야기꾼만 판정할 수 있습니다.';end if;
  select * into g from public.clocktower_gossip where room_id=r.id and day=r.night and id=(p_data->>'declaration_id')::uuid for update;
  if g.id is null or g.truth is distinct from (p_data->>'previous_truth')::boolean then raise exception '판정이 변경되었습니다. 새로고침해 주세요.';end if;
  update public.clocktower_gossip set truth=null,deferred=true where id=g.id;
  if r.bmr_state->'auto'->'gossip'->>'declaration_id'=g.id::text then
   update public.clocktower_live_rooms set bmr_state=jsonb_set(bmr_state,'{auto}',(bmr_state->'auto')-'gossip') where id=r.id;
  end if;
  insert into public.clocktower_gossip_reads values(g.id,auth.uid()) on conflict do nothing;
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
