begin;
alter table public.clocktower_live_members add column ghost_vote_used boolean not null default false;
create table public.clocktower_live_votes (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.clocktower_live_rooms(id) on delete cascade,
 day integer not null,nominator uuid not null,nominee uuid not null,
 status text not null default 'WAITING' check(status in ('WAITING','RUNNING','DONE','CANCELLED')),
 voter_order uuid[] not null default '{}',started_at timestamptz,threshold integer not null default 0,
 ballots jsonb not null default '{}',created_at timestamptz not null default clock_timestamp(),
 unique(room_id,day,nominator),unique(room_id,day,nominee)
);
create unique index clocktower_one_vote on public.clocktower_live_votes(room_id) where status in ('WAITING','RUNNING');
alter table public.clocktower_live_votes enable row level security;
revoke all on public.clocktower_live_votes from public,anon,authenticated;
-- Expiration is derived from a fixed server schedule, even when every phone disconnects.
create function public.clocktower_finish_votes(room uuid) returns void language sql set search_path=public as $$
 update public.clocktower_live_votes set status='DONE' where room_id=room and status='RUNNING' and clock_timestamp()>=started_at+cardinality(voter_order)*interval '3 seconds';
$$;
revoke all on function public.clocktower_finish_votes(uuid) from public,anon,authenticated;
alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_v4;
revoke all on function public.clocktower_live_snapshot_v4(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; rid uuid; items jsonb;
begin
 s:=public.clocktower_live_snapshot_v4(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 rid:=(s->'room'->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 perform public.clocktower_finish_votes(rid);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'day',day,'nominator',nominator,'nominee',nominee,'status',status,'voter_order',voter_order,'started_at',started_at,'threshold',threshold,'ballots',ballots) order by created_at),'[]') into items from public.clocktower_live_votes where room_id=rid and day=(s->'room'->>'night')::integer;
 return s||jsonb_build_object('votes',items,'server_now',clock_timestamp(),'ghost_vote_used',coalesce((select ghost_vote_used from public.clocktower_live_members where room_id=rid and user_id=auth.uid()),false));
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;
alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_v5;
revoke all on function public.clocktower_live_command_v5(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; v public.clocktower_live_votes; m public.clocktower_live_members; nom uuid; target uuid; target_seat integer; idx integer; yes boolean; t timestamptz;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action like 'vote_%' then
  if r.id is null or r.id::text is distinct from p_data->>'room_id' then raise exception '진행방이 바뀌었습니다.';end if;
  if r.phase<>'DAY' then raise exception '낮에만 지목·투표할 수 있습니다.';end if;
  if r.storyteller_id is distinct from auth.uid() and not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=auth.uid()) then raise exception '참가자만 투표할 수 있습니다.';end if;
  perform public.clocktower_finish_votes(r.id);
  if p_action='vote_nominate' then
   nom:=case when r.storyteller_id=auth.uid() then (p_data->>'nominator')::uuid else auth.uid() end;target:=(p_data->>'nominee')::uuid;
   if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=nom and alive) then raise exception '생존자만 지목할 수 있습니다.';end if;
   if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=target) then raise exception '지목할 참가자를 선택해 주세요.';end if;
   if exists(select 1 from public.clocktower_live_votes where room_id=r.id and status in ('WAITING','RUNNING')) then raise exception '현재 지목·투표를 먼저 마무리해 주세요.';end if;
   if exists(select 1 from public.clocktower_live_votes where room_id=r.id and day=r.night and nominator=nom) then raise exception '오늘 이미 지목했습니다. 하루에 한 번만 지목할 수 있습니다.';end if;
   if exists(select 1 from public.clocktower_live_votes where room_id=r.id and day=r.night and nominee=target) then raise exception '오늘 이미 지목받은 참가자입니다.';end if;
   insert into public.clocktower_live_votes(room_id,day,nominator,nominee) values(r.id,r.night,nom,target);return;
  end if;
  select * into v from public.clocktower_live_votes where room_id=r.id and day=r.night and id=(p_data->>'vote_id')::uuid for update;
  if v.id is null then raise exception '현재 투표를 확인해 주세요.';end if;
  if p_action in ('vote_start','vote_cancel') then
   if r.storyteller_id is distinct from auth.uid() then raise exception '이야기꾼만 투표를 진행할 수 있습니다.';end if;
   if p_action='vote_cancel' then
    if v.status not in ('WAITING','RUNNING') then raise exception '이미 종료된 투표입니다.';end if;
    update public.clocktower_live_votes set status='CANCELLED' where id=v.id;
    update public.clocktower_live_rooms set day_activity='DISCUSSION',activity_revision=activity_revision+1 where id=r.id;return;
   end if;
   if v.status<>'WAITING' then raise exception '이미 시작한 투표입니다.';end if;
   select seat into target_seat from public.clocktower_live_members where room_id=r.id and user_id=v.nominee;
   select array_agg(user_id order by case when seat>target_seat then 0 else 1 end,seat) into v.voter_order from public.clocktower_live_members where room_id=r.id;
   select (count(*)+1)/2 into v.threshold from public.clocktower_live_members where room_id=r.id and alive;
   update public.clocktower_live_votes set status='RUNNING',voter_order=v.voter_order,threshold=v.threshold,started_at=clock_timestamp()+interval '5 seconds' where id=v.id;
   update public.clocktower_live_rooms set day_activity='VOTING',activity_revision=activity_revision+1 where id=r.id;return;
  elsif p_action='vote_cast' then
   t:=clock_timestamp();idx:=array_position(v.voter_order,auth.uid());
   if v.status<>'RUNNING' or idx is null or t<v.started_at+(idx-1)*interval '3 seconds' or t>=v.started_at+idx*interval '3 seconds' then raise exception '본인의 투표 시간이 아닙니다. 3초가 지나면 기권 처리됩니다.';end if;
   if v.ballots?auth.uid()::text then raise exception '이미 투표했습니다.';end if;
   if jsonb_typeof(p_data->'yes') is distinct from 'boolean' then raise exception 'O 또는 X를 선택해 주세요.';end if;
   yes:=(p_data->>'yes')::boolean;
   select * into m from public.clocktower_live_members where room_id=r.id and user_id=auth.uid() for update;
   if yes and not m.alive and m.ghost_vote_used then raise exception '사망 후 한 표를 이미 사용했습니다.';end if;
   if yes and not m.alive then update public.clocktower_live_members set ghost_vote_used=true where room_id=r.id and user_id=auth.uid();end if;
   update public.clocktower_live_votes set ballots=ballots||jsonb_build_object(auth.uid()::text,yes) where id=v.id;return;
  end if;
  raise exception '알 수 없는 투표 작업입니다.';
 end if;
 if r.id is not null then perform public.clocktower_finish_votes(r.id);end if;
 if p_action in ('phase','day_activity','engine_execution','member') and exists(select 1 from public.clocktower_live_votes where room_id=r.id and status in ('WAITING','RUNNING')) then
  if p_action='phase' and p_data->>'phase'='ENDED' and r.storyteller_id=auth.uid() then update public.clocktower_live_votes set status='CANCELLED' where room_id=r.id and status in ('WAITING','RUNNING');
  else raise exception '지목·투표를 마치거나 이야기꾼이 취소한 뒤 진행해 주세요.';end if;
 end if;
 perform public.clocktower_live_command_v5(p_event_id,p_action,p_data);
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
