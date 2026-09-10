begin;
-- Manual votes have no deadline. Existing scheduled votes retain their deadline.
alter table public.clocktower_live_missions drop constraint clocktower_live_missions_round_check;
alter table public.clocktower_live_missions add constraint clocktower_live_missions_round_check check(round>0);
alter table public.clocktower_live_missions add column available_at timestamptz not null default clock_timestamp();
alter table public.clocktower_live_rooms add column night_started_at timestamptz;
create table public.clocktower_shots (
 id uuid primary key default gen_random_uuid(),room_id uuid not null references public.clocktower_live_rooms(id) on delete cascade,
 actor uuid not null,target uuid not null,status text not null default 'PENDING',killed boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),unique(room_id,actor),check(status in ('PENDING','DONE'))
);
create unique index clocktower_one_shot on public.clocktower_shots(room_id) where status='PENDING';
alter table public.clocktower_shots enable row level security;
revoke all on public.clocktower_shots from public,anon,authenticated;

create or replace function public.clocktower_make_missions(r public.clocktower_live_rooms,n integer) returns void language plpgsql set search_path=public as $$
declare m record;tiles jsonb;
begin
 if n<>1 then return;end if;
 for m in select user_id from public.clocktower_live_members where room_id=r.id loop
  select jsonb_build_object('tiles',jsonb_agg(i order by random())) into tiles from generate_series(1,10)i;
  insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge,available_at)
  values(r.id,m.user_id,r.night,1,'NUMBERS',tiles,coalesce(r.night_started_at,clock_timestamp())+make_interval(secs=>3+random()*2)) on conflict do nothing;
 end loop;
end $$;
create function public.clocktower_cover_missions() returns trigger language plpgsql set search_path=public as $$
declare m record;tiles jsonb;n integer;
begin
 -- Do not queue work for someone who is already doing a mission or an ability.
 for m in select user_id from public.clocktower_live_members p where p.room_id=new.room_id and p.user_id<>new.user_id
 and not exists(select 1 from public.clocktower_live_missions where room_id=p.room_id and night=new.night and user_id=p.user_id and not completed)
 and not exists(select 1 from public.clocktower_live_requests where room_id=p.room_id and night=new.night and user_id=p.user_id and (status in ('OPEN','SUBMITTED') or (status='RESOLVED' and not acknowledged)))
 and random()<0.6 loop
  select coalesce(max(round),0)+1 into n from public.clocktower_live_missions where room_id=new.room_id and night=new.night and user_id=m.user_id;
  if n=1 then continue;end if;
  select jsonb_build_object('tiles',jsonb_agg(i order by random())) into tiles from generate_series(1,10)i;
  insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge,available_at)
  values(new.room_id,m.user_id,new.night,n,'NUMBERS',tiles,clock_timestamp()+make_interval(secs=>random()*2));
 end loop;
 return new;
end $$;
create trigger clocktower_cover_after_request after insert on public.clocktower_live_requests for each row execute function public.clocktower_cover_missions();
revoke all on function public.clocktower_cover_missions() from public,anon,authenticated;

alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_v7;
revoke all on function public.clocktower_live_snapshot_v7(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb;r public.clocktower_live_rooms;items jsonb;
begin
 s:=public.clocktower_live_snapshot_v7(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select * into r from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
 if r.phase='NIGHT' and not (s->>'is_host')::boolean then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'round',round,'kind',kind,'challenge',challenge,'completed',completed) order by round),'[]') into items from public.clocktower_live_missions where room_id=r.id and night=r.night and user_id=auth.uid() and available_at<=clock_timestamp();
  s:=s||jsonb_build_object('missions',items);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'actor',actor,'target',target,'status',status,'killed',killed) order by created_at),'[]') into items from public.clocktower_shots where room_id=r.id;
 return s||jsonb_build_object('shots',items);
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_v7;
revoke all on function public.clocktower_live_command_v7(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms;after_r public.clocktower_live_rooms;v public.clocktower_live_votes;m public.clocktower_live_members;t public.clocktower_live_members;shot public.clocktower_shots;scarlet uuid;uid uuid;yes boolean;dies boolean;conditions jsonb;pair record;flag text;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action='create' then perform public.clocktower_live_command_v7(p_event_id,p_action,p_data);return;end if;
 if r.id is null or r.id::text is distinct from p_data->>'room_id' or r.phase='ENDED' then raise exception '현재 진행방을 확인해 주세요.';end if;
 if p_action in ('flow_next','vote_nominate','vote_start','member') and exists(select 1 from public.clocktower_shots where room_id=r.id and status='PENDING') then raise exception '처단자 공개 선언을 먼저 판정해 주세요.';end if;
 if p_action='vote_cast' then raise exception '현장에서 손을 들면 이야기꾼이 기록합니다.';end if;
 if p_action in ('vote_start','vote_record','vote_finish') then
  if r.storyteller_id<>auth.uid() or r.phase<>'DAY' then raise exception '이야기꾼이 낮에 투표를 진행해 주세요.';end if;
  select * into v from public.clocktower_live_votes where room_id=r.id and day=r.night and id=(p_data->>'vote_id')::uuid for update;
  if v.id is null then raise exception '현재 투표를 확인해 주세요.';end if;
  if p_action='vote_start' then
   perform public.clocktower_live_command_v7(p_event_id,p_action,p_data);
   update public.clocktower_live_votes set started_at=null where id=v.id;return;
  end if;
  if v.status<>'RUNNING' or v.started_at is not null then raise exception '진행 중인 수동 투표가 아닙니다.';end if;
  if p_action='vote_record' then
   if jsonb_typeof(p_data->'yes') is distinct from 'boolean' then raise exception '투표 여부를 확인해 주세요.';end if;
   uid:=(p_data->>'user_id')::uuid;yes:=(p_data->>'yes')::boolean;
   select * into m from public.clocktower_live_members where room_id=r.id and user_id=uid;
   if m.user_id is null or not uid=any(v.voter_order) then raise exception '참가자를 확인해 주세요.';end if;
   if yes and not m.alive and m.ghost_vote_used then raise exception '사망 후 투표권을 이미 사용했습니다.';end if;
   update public.clocktower_live_votes set ballots=ballots||jsonb_build_object(uid::text,yes) where id=v.id;return;
  end if;
  if exists(select 1 from public.clocktower_live_members where room_id=r.id and actual_role='집사' and public.clocktower_healthy(r.id,user_id) and v.ballots->>user_id::text='true') and coalesce((p_data->>'butler_checked')::boolean,false)=false then raise exception '집사의 주인이 손을 들었거나 이미 집계됐는지 현장에서 확인해 주세요.';end if;
  if exists(select 1 from public.clocktower_live_members where room_id=r.id and not alive and ghost_vote_used and v.ballots->>user_id::text='true') then raise exception '사용한 사망자 투표권이 포함되어 있습니다.';end if;
  update public.clocktower_live_members set ghost_vote_used=true where room_id=r.id and not alive and v.ballots->>user_id::text='true';
  update public.clocktower_live_votes set status='DONE' where id=v.id;
  update public.clocktower_live_rooms set day_activity='DISCUSSION',activity_revision=activity_revision+1 where id=r.id;return;
 end if;
 if p_action in ('slayer_declare','slayer_resolve') then
  if r.phase<>'DAY' then raise exception '낮에 공개적으로 사용해 주세요.';end if;
  if exists(select 1 from public.clocktower_live_votes where room_id=r.id and status='RUNNING') then raise exception '진행 중인 투표 집계를 먼저 마쳐 주세요.';end if;
  if p_action='slayer_declare' then
   uid:=case when auth.uid()=r.storyteller_id then (p_data->>'actor')::uuid else auth.uid() end;
   if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=uid) or not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=(p_data->>'target')::uuid) then raise exception '참가자를 선택해 주세요.';end if;
   if exists(select 1 from public.clocktower_shots where room_id=r.id and (actor=uid or status='PENDING')) then raise exception '이미 선언했거나 판정 대기 중인 선언이 있습니다.';end if;
   insert into public.clocktower_shots(room_id,actor,target) values(r.id,uid,(p_data->>'target')::uuid);return;
  end if;
  if auth.uid()<>r.storyteller_id then raise exception '이야기꾼만 판정할 수 있습니다.';end if;
  select * into shot from public.clocktower_shots where id=(p_data->>'shot_id')::uuid and room_id=r.id for update;
  if shot.id is null or shot.status<>'PENDING' then raise exception '이미 판정한 선언입니다.';end if;
  select * into m from public.clocktower_live_members where room_id=r.id and user_id=shot.actor;
  select * into t from public.clocktower_live_members where room_id=r.id and user_id=shot.target;
  dies:=m.actual_role='처단자' and public.clocktower_healthy(r.id,m.user_id) and t.alive and (t.actual_role='임프' or (t.actual_role='은둔자' and public.clocktower_healthy(r.id,t.user_id) and coalesce((p_data->>'recluse_as_demon')::boolean,false)));
  if dies then
   if t.actual_role='임프' and (select count(*) from public.clocktower_live_members where room_id=r.id and alive)>=5 then select user_id into scarlet from public.clocktower_live_members where room_id=r.id and actual_role='탕녀' and public.clocktower_healthy(r.id,user_id) limit 1;end if;
   update public.clocktower_live_members set alive=false,public_alive=false where room_id=r.id and user_id=t.user_id;
   if scarlet is not null then
    update public.clocktower_live_members set actual_role='임프',shown_role='임프' where room_id=r.id and user_id=scarlet;
    update public.clocktower_live_rooms set night_engine=jsonb_set(night_engine,'{notices}',coalesce(night_engine->'notices','[]')||to_jsonb(scarlet::text)),engine_version=engine_version+1 where id=r.id;
   end if;
  end if;
  update public.clocktower_shots set status='DONE',killed=dies where id=shot.id;
  perform public.clocktower_check_winner(r.id);return;
 end if;
 if p_action='mission_complete' and exists(select 1 from public.clocktower_live_missions where id=(p_data->>'mission_id')::uuid and available_at>clock_timestamp()) then raise exception '아직 도착하지 않은 미션입니다.';end if;
 perform public.clocktower_live_command_v7(p_event_id,p_action,p_data);
 select * into after_r from public.clocktower_live_rooms where id=r.id;
 if after_r.phase='NIGHT' and (r.phase<>'NIGHT' or after_r.night<>r.night) then
  conditions:=coalesce(after_r.night_engine->'conditions','{}');
  for pair in select * from jsonb_each(conditions) loop
   foreach flag in array array['drunk','poisoned'] loop
    if coalesce((pair.value->>(flag||'_until'))::integer,0)>0 and (pair.value->>(flag||'_until'))::integer<=after_r.night then conditions:=jsonb_set(conditions,array[pair.key,flag],'false');end if;
   end loop;
  end loop;
  update public.clocktower_live_rooms set night_started_at=clock_timestamp(),night_engine=jsonb_set(night_engine,'{conditions}',conditions),engine_version=engine_version+1 where id=r.id;
  select * into after_r from public.clocktower_live_rooms where id=r.id;
  perform public.clocktower_make_missions(after_r,1);
 end if;
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
