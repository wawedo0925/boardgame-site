begin;
alter table public.clocktower_live_rooms add column day_activity text not null default 'DISCUSSION' check(day_activity in ('DISCUSSION','VOTING')), add column activity_revision integer not null default 0;
create table public.clocktower_live_missions (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references public.clocktower_live_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id), night integer not null, round integer not null check(round in (1,2)),
 kind text not null check(kind in ('NUMBERS','TEXT')), challenge jsonb not null, completed boolean not null default false,
 unique(room_id,night,user_id,round)
);
alter table public.clocktower_live_missions enable row level security;
revoke all on public.clocktower_live_missions from public,anon,authenticated;
create function public.clocktower_make_missions(r public.clocktower_live_rooms, n integer) returns void language plpgsql set search_path=public as $$
declare m record; challenge_value jsonb; phrases text[]:=array['오늘도 마을의 시계는 움직입니다','밤하늘에 작은 별이 빛납니다','새로운 아침을 함께 기다립니다','조용한 마을에 바람이 불어옵니다'];
begin
 for m in select user_id from public.clocktower_live_members where room_id=r.id loop
  if n=1 then select jsonb_build_object('tiles',jsonb_agg(i order by random())) into challenge_value from generate_series(1,10) i;
  else challenge_value:=jsonb_build_object('text',phrases[1+floor(random()*4)::integer]);end if;
  insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge) values(r.id,m.user_id,r.night,n,case when n=1 then 'NUMBERS' else 'TEXT' end,challenge_value) on conflict do nothing;
 end loop;
end $$;
revoke all on function public.clocktower_make_missions(public.clocktower_live_rooms,integer) from public,anon,authenticated;
alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_v3;
revoke all on function public.clocktower_live_snapshot_v3(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; r public.clocktower_live_rooms; items jsonb;
begin
 s:=public.clocktower_live_snapshot_v3(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select * into r from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
 s:=jsonb_set(s,'{room}',s->'room'||jsonb_build_object('day_activity',r.day_activity,'activity_revision',r.activity_revision));
 if r.phase='NIGHT' then
  if coalesce((s->>'is_host')::boolean,false) then
   select coalesce(jsonb_agg(x),'[]') into items from (select user_id,count(*) filter(where completed) as completed,count(*) as total from public.clocktower_live_missions where room_id=r.id and night=r.night group by user_id) x;
   s:=s||jsonb_build_object('mission_progress',items);
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'round',round,'kind',kind,'challenge',challenge,'completed',completed) order by round),'[]') into items from public.clocktower_live_missions where room_id=r.id and night=r.night and user_id=auth.uid();
   s:=s||jsonb_build_object('missions',items);
  end if;
 end if;
 return s;
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;
alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_v4;
revoke all on function public.clocktower_live_command_v4(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; m public.clocktower_live_missions;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action in ('mission_complete','mission_offline','day_activity') then
  if r.id is null or r.id::text is distinct from p_data->>'room_id' then raise exception '진행방이 바뀌었습니다.';end if;
  if p_action='day_activity' then
   if r.storyteller_id is distinct from auth.uid() or r.phase<>'DAY' then raise exception '이야기꾼이 낮에 진행해 주세요.';end if;
   if coalesce(p_data->>'activity','') not in ('DISCUSSION','VOTING') then raise exception '진행 단계를 확인해 주세요.';end if;
   update public.clocktower_live_rooms set day_activity=p_data->>'activity',activity_revision=activity_revision+1 where id=r.id and day_activity<>p_data->>'activity';return;
  end if;
  if r.phase<>'NIGHT' then raise exception '현재 밤의 미션만 완료할 수 있습니다.';end if;
  if p_action='mission_offline' then
   if r.storyteller_id is distinct from auth.uid() then raise exception '이야기꾼만 현장 완료 처리할 수 있습니다.';end if;
   update public.clocktower_live_missions set completed=true where room_id=r.id and night=r.night and user_id=(p_data->>'user_id')::uuid;return;
  end if;
  select * into m from public.clocktower_live_missions where id=(p_data->>'mission_id')::uuid and room_id=r.id and night=r.night and user_id=auth.uid() for update;
  if m.id is null then raise exception '본인의 현재 미션을 확인해 주세요.';end if;
  if m.completed then return;end if;
  if (case when m.kind='NUMBERS' then '1,2,3,4,5,6,7,8,9,10' else m.challenge->>'text' end) is distinct from trim(p_data->>'answer') then raise exception '미션을 끝까지 완료해 주세요.';end if;
  update public.clocktower_live_missions set completed=true where id=m.id;return;
 end if;
 if p_action='phase' and p_data->>'phase'='DAY' and r.phase='NIGHT' and exists(select 1 from public.clocktower_live_missions where room_id=r.id and night=r.night and not completed) then raise exception '모든 참가자의 공통 미션을 먼저 완료해 주세요.';end if;
 perform public.clocktower_live_command_v4(p_event_id,p_action,p_data);
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1;
 if p_action='phase' then update public.clocktower_live_rooms set day_activity='DISCUSSION',activity_revision=0 where id=r.id;end if;
 if p_action='engine_start' then perform public.clocktower_make_missions(r,1);end if;
 if p_action='engine_next' and (coalesce((r.night_engine->>'finished')::boolean,false) or (r.night_engine->>'cursor')::integer>=jsonb_array_length(r.night_engine->'tasks')/2) then perform public.clocktower_make_missions(r,2);end if;
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
