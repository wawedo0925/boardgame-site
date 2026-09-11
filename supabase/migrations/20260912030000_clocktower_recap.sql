begin;
alter table public.clocktower_live_rooms add column recap_shared boolean not null default false;
create table public.clocktower_recap_entries (
 id bigint generated always as identity primary key,
 room_id uuid not null references public.clocktower_live_rooms(id) on delete cascade,
 night integer not null, phase text not null, title text not null, details jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index on public.clocktower_recap_entries(room_id,id);
alter table public.clocktower_recap_entries enable row level security;
revoke all on public.clocktower_recap_entries from public,anon,authenticated;

create function public.clocktower_recap_name(room uuid, person uuid) returns text
language sql stable security definer set search_path=public as $$
 select coalesce(p.activity_name,'참가자')||' ('||coalesce(nullif(m.actual_role,''),'미배정')||')'
 from public.clocktower_live_members m left join public.profiles p on p.id=m.user_id
 where m.room_id=room and m.user_id=person
$$;
revoke all on function public.clocktower_recap_name(uuid,uuid) from public,anon,authenticated;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_before_recap;
revoke all on function public.clocktower_live_command_before_recap(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; a public.clocktower_live_rooms; q public.clocktower_live_requests;
 v public.clocktower_live_votes; shot public.clocktower_shots; before_members jsonb; m record;
 task jsonb; heading text; lines jsonb:='[]'; targets text; actor text; effect jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into before_members from public.clocktower_live_members x where room_id=r.id;
 task:=r.night_engine->'tasks'->coalesce((r.night_engine->>'cursor')::integer,0);
 if p_action='engine_approve' then select * into q from public.clocktower_live_requests where id=(p_data->>'request_id')::uuid and room_id=r.id;end if;
 perform public.clocktower_live_command_before_recap(p_event_id,p_action,p_data);
 if r.id is null or p_action='create' then return;end if;
 select * into a from public.clocktower_live_rooms where id=r.id;
 if p_action='engine_approve' and q.id is not null then
  actor:=public.clocktower_recap_name(r.id,q.user_id);
  heading:=coalesce(actor,'참가자')||' · '||coalesce(task->>'role','능력')||' 처리';
  select string_agg(public.clocktower_recap_name(r.id,id),', ' order by n) into targets from unnest(q.targets) with ordinality t(id,n);
  if targets is not null then lines:=lines||jsonb_build_array('선택 대상: '||targets);end if;
  lines:=lines||jsonb_build_array(case when task->>'role'='첩자' then '마도서 정보를 전달했습니다.' else '전달 결과: '||coalesce(p_data->>'result','') end);
 elsif p_action='vote_nominate' then
  select * into v from public.clocktower_live_votes where room_id=r.id order by created_at desc,id desc limit 1;
  heading:='지목'; lines:=lines||jsonb_build_array(public.clocktower_recap_name(r.id,v.nominator)||' → '||public.clocktower_recap_name(r.id,v.nominee));
 elsif p_action in ('vote_finish','vote_cancel') then
  select * into v from public.clocktower_live_votes where id=(p_data->>'vote_id')::uuid and room_id=r.id;
  heading:=case when p_action='vote_finish' then '투표 집계 완료' else '지목·투표 취소' end;
  lines:=lines||jsonb_build_array('대상: '||public.clocktower_recap_name(r.id,v.nominee),'찬성 '||(select count(*) from jsonb_each(v.ballots) where value='true'::jsonb)||'표 / 필요 '||v.threshold||'표');
 elsif p_action in ('slayer_declare','slayer_resolve') then
  select * into shot from public.clocktower_shots where room_id=r.id and (p_action='slayer_declare' or id=(p_data->>'shot_id')::uuid) order by created_at desc limit 1;
  heading:=case when p_action='slayer_declare' then '처단자 능력 선언' else '처단자 능력 판정' end;
  lines:=lines||jsonb_build_array(public.clocktower_recap_name(r.id,shot.actor)||' → '||public.clocktower_recap_name(r.id,shot.target));
  if p_action='slayer_resolve' then lines:=lines||jsonb_build_array(case when shot.killed then '대상 사망' else '사망 없음' end);end if;
 elsif p_action='cancel' then heading:='능력 차례 건너뛰기';
 elsif p_action='member' and r.phase<>'SETUP' then heading:='이야기꾼 역할·상태 변경';
 elsif p_action='engine_settings' then heading:='이야기꾼 판정 설정 변경';
 end if;
 if r.night_engine->'poison' is distinct from a.night_engine->'poison' then
  effect:=a.night_engine->'poison';
  lines:=lines||jsonb_build_array(case when effect->>'target' is null then '독살범의 중독 효과 종료' else public.clocktower_recap_name(r.id,(effect->>'source')::uuid)||' → '||public.clocktower_recap_name(r.id,(effect->>'target')::uuid)||' 중독 적용' end);
 end if;
 if r.night_engine->'protection' is distinct from a.night_engine->'protection' then
  effect:=a.night_engine->'protection';
  lines:=lines||jsonb_build_array(case when effect->>'target' is null then '수도사의 보호 효과 종료' else public.clocktower_recap_name(r.id,(effect->>'source')::uuid)||' → '||public.clocktower_recap_name(r.id,(effect->>'target')::uuid)||' 보호 적용' end);
 end if;
 if r.night_engine->'conditions' is distinct from a.night_engine->'conditions' then
  for m in select x.user_id from public.clocktower_live_members x where room_id=r.id loop
   if r.night_engine->'conditions'->m.user_id::text is distinct from a.night_engine->'conditions'->m.user_id::text then
    effect:=a.night_engine->'conditions'->m.user_id::text;
    lines:=lines||jsonb_build_array(public.clocktower_recap_name(r.id,m.user_id)||' · 취함 '||case when coalesce((effect->>'drunk')::boolean,false) then '설정' else '해제' end||' / 중독 '||case when coalesce((effect->>'poisoned')::boolean,false) then '설정' else '해제' end);
   end if;
  end loop;
 end if;
 for m in select x.*,b.value as previous from public.clocktower_live_members x join jsonb_array_elements(before_members) b(value) on b.value->>'user_id'=x.user_id::text where x.room_id=r.id loop
  if m.alive is distinct from (m.previous->>'alive')::boolean then
   lines:=lines||jsonb_build_array(case when not m.alive and p_action='engine_approve' and task->>'role'='임프' then coalesce(actor,'임프')||'의 공격으로 ' else '' end||public.clocktower_recap_name(r.id,m.user_id)||case when m.alive then ' 부활' else ' 사망' end);
  end if;
  if r.phase<>'SETUP' and m.actual_role is distinct from m.previous->>'actual_role' then lines:=lines||jsonb_build_array(public.clocktower_recap_name(r.id,m.user_id)||' · 이전 역할: '||(m.previous->>'actual_role'));end if;
 end loop;
 if r.night_engine->'execution' is distinct from a.night_engine->'execution' and a.night_engine->'execution'->>'user_id' is not null then
  lines:=lines||jsonb_build_array('처형: '||public.clocktower_recap_name(r.id,(a.night_engine->'execution'->>'user_id')::uuid));
 end if;
 if r.phase is distinct from a.phase or r.day_stage is distinct from a.day_stage or r.roles_released is distinct from a.roles_released then
  lines:=lines||jsonb_build_array(case when a.phase='ENDED' then '게임 종료 · '||case a.winner when 'GOOD' then '선 진영 승리' when 'EVIL' then '악 진영 승리' else '승패 미확정' end when a.phase='NIGHT' then a.night||'번째 밤 시작' when a.phase='DAY' then case when a.day_stage='PRIVATE' then '낮 밀담 시작' else '전체 토론·지목 시작' end when a.roles_released then '역할 배포·확인 시작' else '역할 준비' end);
 end if;
 if heading is not null or jsonb_array_length(lines)>0 then
  insert into public.clocktower_recap_entries(room_id,night,phase,title,details) values(r.id,r.night,r.phase,coalesce(heading,'진행 변경'),lines);
 end if;
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;

create function public.clocktower_recap(p_room_id uuid,p_publish boolean default false,p_confirm boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; host boolean; visible boolean; items jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 select * into r from public.clocktower_live_rooms where id=p_room_id for update;
 host:=r.storyteller_id=auth.uid();
 if r.id is null or (not host and not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=auth.uid())) then raise exception '참가자만 볼 수 있습니다.';end if;
 if p_publish then
  if not host or not coalesce(p_confirm,false) then raise exception '이야기꾼의 공개 확인이 필요합니다.';end if;
  update public.clocktower_live_rooms set recap_shared=true where id=r.id;
 end if;
 visible:=host or r.phase='ENDED' or r.recap_shared or p_publish;
 if visible then select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into items from public.clocktower_recap_entries e where room_id=r.id;end if;
 return jsonb_build_object('is_host',host,'visible',visible,'shared',r.recap_shared or p_publish,'ended',r.phase='ENDED','entries',coalesce(items,'[]'::jsonb));
end $$;
revoke all on function public.clocktower_recap(uuid,boolean,boolean) from public,anon;
grant execute on function public.clocktower_recap(uuid,boolean,boolean) to authenticated;
commit;
