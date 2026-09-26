begin;
create table public.clocktower_gossip (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.clocktower_live_rooms(id) on delete cascade,
 actor uuid not null references auth.users(id), day integer not null,
 statement text not null check(char_length(btrim(statement)) between 1 and 2000),
 truth boolean, created_at timestamptz not null default clock_timestamp(),
 unique(room_id,day,actor)
);
create table public.clocktower_gossip_reads (
 declaration_id uuid references public.clocktower_gossip(id) on delete cascade,
 user_id uuid references auth.users(id), primary key(declaration_id,user_id)
);
alter table public.clocktower_gossip enable row level security;
alter table public.clocktower_gossip_reads enable row level security;
revoke all on public.clocktower_gossip,public.clocktower_gossip_reads from public,anon,authenticated;

alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_before_gossip;
revoke all on function public.clocktower_live_snapshot_before_gossip(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; r public.clocktower_live_rooms; declarations jsonb;
begin
 s:=public.clocktower_live_snapshot_before_gossip(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select * into r from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
 if r.script='BMR' then
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'actor',g.actor,'day',g.day,'statement',g.statement,
   'acknowledged',exists(select 1 from public.clocktower_gossip_reads a where a.declaration_id=g.id and a.user_id=auth.uid()))
   ||case when r.storyteller_id=auth.uid() then jsonb_build_object('truth',g.truth) else '{}'::jsonb end order by g.created_at,g.id),'[]') into declarations
  from public.clocktower_gossip g where g.room_id=r.id;
  s:=s||jsonb_build_object('gossip_declarations',declarations);
 end if;
 return s;
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_before_gossip;
revoke all on function public.clocktower_live_command_before_gossip(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; g public.clocktower_gossip; m public.clocktower_live_members; actor_id uuid; verdict boolean;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action in ('gossip_declare','gossip_judge','gossip_ack') then
  if r.id is null or r.id::text is distinct from p_data->>'room_id' or r.script<>'BMR' then raise exception '현재 피로 물든 달 방에서만 가능합니다.';end if;
  if r.storyteller_id<>auth.uid() and not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=auth.uid()) then raise exception '참가자만 사용할 수 있습니다.';end if;
  if p_action='gossip_ack' then
   select * into g from public.clocktower_gossip where room_id=r.id and id=(p_data->>'declaration_id')::uuid;
   if g.id is null then raise exception '선언을 찾을 수 없습니다.';end if;
   insert into public.clocktower_gossip_reads values(g.id,auth.uid()) on conflict do nothing;return;
  end if;
  if r.phase<>'DAY' or (p_data->>'day')::integer is distinct from r.night or r.bmr_state->'auto'?'pending' then raise exception '현재 낮에만 선언·판정할 수 있습니다.';end if;
  if p_action='gossip_declare' then
   actor_id:=case when r.storyteller_id=auth.uid() then (p_data->>'actor')::uuid else auth.uid() end;
   select * into m from public.clocktower_live_members where room_id=r.id and user_id=actor_id;
   if m.user_id is null or not m.public_alive then raise exception '살아 있는 참가자만 선언할 수 있습니다.';end if;
   if char_length(btrim(coalesce(p_data->>'statement',''))) not between 1 and 2000 then raise exception '험담 내용을 1~2000자로 입력하세요.';end if;
   if exists(select 1 from public.clocktower_gossip where room_id=r.id and day=r.night and actor=actor_id) then raise exception '오늘 이미 험담을 선언했습니다.';end if;
   insert into public.clocktower_gossip(room_id,actor,day,statement) values(r.id,actor_id,r.night,btrim(p_data->>'statement'));
   -- Invalidate in-flight host decisions so a concurrent declaration cannot be skipped.
   update public.clocktower_live_rooms set bmr_revision=bmr_revision+1 where id=r.id;return;
  end if;
  if r.storyteller_id<>auth.uid() then raise exception '이야기꾼만 참거짓을 판정할 수 있습니다.';end if;
  select * into g from public.clocktower_gossip where room_id=r.id and day=r.night and id=(p_data->>'declaration_id')::uuid for update;
  if g.id is null or jsonb_typeof(p_data->'truth') is distinct from 'boolean' then raise exception '선언과 판정을 확인하세요.';end if;
  if g.truth is distinct from (p_data->>'previous_truth')::boolean then raise exception '판정이 변경되었습니다. 새로고침해 주세요.';end if;
  verdict:=(p_data->>'truth')::boolean;
  update public.clocktower_gossip set truth=verdict where id=g.id;
  select * into m from public.clocktower_live_members where room_id=r.id and user_id=g.actor;
  if m.actual_role='험담꾼' and r.bmr_state?'auto' then
   update public.clocktower_live_rooms set bmr_state=jsonb_set(bmr_state,'{auto,gossip}',jsonb_build_object('day',g.day,'text',g.statement,'truth',verdict,'actor',g.actor,'declaration_id',g.id)) where id=r.id;
  end if;
  update public.clocktower_live_rooms set bmr_revision=bmr_revision+1 where id=r.id;return;
 end if;
 if r.script='BMR' and r.phase='DAY' then
  if (p_action='bmr_auto_commit' and (p_data->>'operation'='execution' or p_data->'auto'->>'phase' in ('NIGHT','ENDED')))
   or (p_action='flow_next' and r.day_stage='NOMINATIONS') then
   if exists(select 1 from public.clocktower_gossip where room_id=r.id and day=r.night and truth is null) then raise exception '험담 선언의 참거짓을 먼저 판정해 주세요.';end if;
  end if;
  if p_action='bmr_auto_commit' and p_data->'auto'->'gossip' is distinct from r.bmr_state->'auto'->'gossip' then raise exception '험담 선언 판정 화면을 이용해 주세요.';end if;
 end if;
 perform public.clocktower_live_command_before_gossip(p_event_id,p_action,p_data);
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
