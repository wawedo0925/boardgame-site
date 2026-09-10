begin;
alter table public.clocktower_live_rooms
 add column roles_released boolean not null default false,
 add column day_stage text not null default 'PRIVATE',
 add column flow_revision integer not null default 0,
 add column virgin_used jsonb not null default '{}',
 add column winner text,
 add column end_reason text;
alter table public.clocktower_live_members add column role_confirmed boolean not null default false;

create function public.clocktower_healthy(room uuid,who uuid) returns boolean language sql stable set search_path=public as $$
 select m.alive and m.actual_role<>'주정뱅이'
 and not coalesce((r.night_engine->'conditions'->who::text->>'drunk')::boolean,false)
 and not coalesce((r.night_engine->'conditions'->who::text->>'poisoned')::boolean,false)
 and not exists(select 1 from public.clocktower_live_members p where p.room_id=room and p.user_id::text=r.night_engine->'poison'->>'source' and p.alive and p.actual_role='독살범'
 and r.night_engine->'poison'->>'target'=who::text and (r.night_engine->'poison'->>'night')::integer=r.night
 and not coalesce((r.night_engine->'conditions'->p.user_id::text->>'drunk')::boolean,false)
 and not coalesce((r.night_engine->'conditions'->p.user_id::text->>'poisoned')::boolean,false))
 from public.clocktower_live_members m join public.clocktower_live_rooms r on r.id=m.room_id where m.room_id=room and m.user_id=who;
$$;
create function public.clocktower_end_game(room uuid,team text,reason text) returns void language plpgsql set search_path=public as $$
begin
 update public.clocktower_live_rooms set phase='ENDED',winner=team,end_reason=reason,flow_revision=flow_revision+1 where id=room;
 update public.clocktower_live_members set public_alive=alive where room_id=room;
 update public.clocktower_live_requests set status='CANCELLED' where room_id=room and status in ('OPEN','SUBMITTED');
 update public.clocktower_live_votes set status='CANCELLED' where room_id=room and status in ('WAITING','RUNNING');
end $$;
create function public.clocktower_check_winner(room uuid) returns void language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.clocktower_live_rooms where id=room and phase in ('SETUP','ENDED')) then return;end if;
 if not exists(select 1 from public.clocktower_live_members where room_id=room and actual_role='임프' and alive) then
  perform public.clocktower_end_game(room,'GOOD','생존 악마가 없습니다.');
 elsif (select count(*) from public.clocktower_live_members where room_id=room and alive)<=2 then
  perform public.clocktower_end_game(room,'EVIL','생존자가 두 명 남았습니다.');
 end if;
end $$;
create function public.clocktower_execute(room uuid,who uuid) returns void language plpgsql set search_path=public as $$
declare m public.clocktower_live_members;r public.clocktower_live_rooms;scarlet uuid;saint boolean;
begin
 select * into r from public.clocktower_live_rooms where id=room;
 select * into m from public.clocktower_live_members where room_id=room and user_id=who;
 if m.user_id is null then raise exception '처형 대상을 확인해 주세요.';end if;
 if not m.alive then return;end if;
 saint:=m.actual_role='성자' and public.clocktower_healthy(room,who);
 if m.actual_role='임프' and (select count(*) from public.clocktower_live_members where room_id=room and alive)>=5 then
  select user_id into scarlet from public.clocktower_live_members where room_id=room and actual_role='탕녀' and public.clocktower_healthy(room,user_id) limit 1;
 end if;
 update public.clocktower_live_members set alive=false,public_alive=false where room_id=room and user_id=who;
 update public.clocktower_live_rooms set night_engine=night_engine||jsonb_build_object('execution',jsonb_build_object('night',r.night,'user_id',who,'role',m.actual_role)),engine_version=engine_version+1 where id=room;
 if scarlet is not null then
  update public.clocktower_live_members set actual_role='임프',shown_role='임프' where room_id=room and user_id=scarlet;
  update public.clocktower_live_rooms set night_engine=jsonb_set(night_engine,'{notices}',coalesce(night_engine->'notices','[]')||to_jsonb(scarlet::text)),engine_version=engine_version+1 where id=room;
 end if;
 if saint then perform public.clocktower_end_game(room,'EVIL','성자가 처형으로 사망했습니다.');else perform public.clocktower_check_winner(room);end if;
end $$;
revoke all on function public.clocktower_healthy(uuid,uuid),public.clocktower_end_game(uuid,text,text),public.clocktower_check_winner(uuid),public.clocktower_execute(uuid,uuid) from public,anon,authenticated;

alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_v6;
revoke all on function public.clocktower_live_snapshot_v6(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb;r public.clocktower_live_rooms;roster jsonb;
begin
 s:=public.clocktower_live_snapshot_v6(p_event_id);
 if s->'room' is null or s->'room'='null'::jsonb then return s;end if;
 select * into r from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
 select jsonb_agg(item.value||jsonb_build_object('role_confirmed',m.role_confirmed)||case when r.roles_released and m.user_id=auth.uid() then jsonb_build_object('shown_role',m.shown_role) else '{}'::jsonb end order by item.ordinality) into roster
 from jsonb_array_elements(s->'members') with ordinality item(value,ordinality) join public.clocktower_live_members m on m.room_id=r.id and m.user_id::text=item.value->>'user_id';
 return jsonb_set(jsonb_set(s,'{members}',coalesce(roster,'[]')),'{room}',s->'room'||jsonb_build_object('roles_released',r.roles_released,'day_stage',r.day_stage,'flow_revision',r.flow_revision,'winner',r.winner,'end_reason',r.end_reason));
end $$;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_v6;
revoke all on function public.clocktower_live_command_v6(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms;rows jsonb;candidate uuid;top_count integer;leaders integer;nom uuid;target public.clocktower_live_members;actor public.clocktower_live_members;perceived text;
 towns text[]:=array['세탁부','사서','수사관','요리사','초공감자','점쟁이','장의사','수도사','까마귀지기','성결자','처단자','군인','시장'];
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action='create' then perform public.clocktower_live_command_v6(p_event_id,p_action,p_data);return;end if;
 if r.id is null or r.id::text is distinct from p_data->>'room_id' then raise exception '진행방이 바뀌었습니다.';end if;
 if r.phase='ENDED' then raise exception '종료된 게임입니다.';end if;
 if r.phase='SETUP' and r.roles_released and p_action in ('member','remove_member','sync_participants','swap_seats','save_roles','engine_information') then raise exception '역할 확인 중입니다. 준비로 돌아간 뒤 수정해 주세요.';end if;
 if p_action='role_ack' then
  if r.phase<>'SETUP' or not r.roles_released then raise exception '역할 확인 단계가 아닙니다.';end if;
  update public.clocktower_live_members set role_confirmed=true where room_id=r.id and user_id=auth.uid();
  if not found then raise exception '참가자만 확인할 수 있습니다.';end if;return;
 end if;
 if p_action='roles_reset' then
  if r.storyteller_id<>auth.uid() or r.phase<>'SETUP' then raise exception '이야기꾼만 준비로 돌아갈 수 있습니다.';end if;
  update public.clocktower_live_rooms set roles_released=false,flow_revision=flow_revision+1 where id=r.id;
  update public.clocktower_live_members set role_confirmed=false where room_id=r.id;return;
 end if;
 if p_action='flow_next' then
  if r.storyteller_id<>auth.uid() then raise exception '이야기꾼만 페이즈를 넘길 수 있습니다.';end if;
  if (p_data->>'revision')::integer is distinct from r.flow_revision then raise exception '이미 단계가 변경되었습니다.';end if;
  perform public.clocktower_finish_votes(r.id);
  if exists(select 1 from public.clocktower_live_votes where room_id=r.id and status in ('WAITING','RUNNING')) then raise exception '지목·변론·투표를 먼저 마쳐 주세요.';end if;
  if r.phase='SETUP' then
   select jsonb_agg(jsonb_build_object('actual_role',actual_role,'shown_role',shown_role)) into rows from public.clocktower_live_members where room_id=r.id;
   perform public.clocktower_validate_setup(rows);
   perform public.clocktower_validate_information(r.id,r.night_engine->'information',r.night_engine->>'red_herring');
   if not r.roles_released then
    update public.clocktower_live_rooms set roles_released=true,flow_revision=flow_revision+1 where id=r.id;
    update public.clocktower_live_members set role_confirmed=false where room_id=r.id;return;
   end if;
   if exists(select 1 from public.clocktower_live_members where room_id=r.id and not role_confirmed) then raise exception '모든 참가자가 역할을 확인해야 합니다.';end if;
   perform public.clocktower_live_command_v6(p_event_id,'phase',jsonb_build_object('room_id',r.id,'phase','NIGHT'));
  elsif r.phase='NIGHT' then
   perform public.clocktower_check_winner(r.id);
   if (select phase from public.clocktower_live_rooms where id=r.id)='ENDED' then return;end if;
   perform public.clocktower_live_command_v6(p_event_id,'phase',jsonb_build_object('room_id',r.id,'phase','DAY'));
   update public.clocktower_live_rooms set day_stage='PRIVATE' where id=r.id;
  elsif r.day_stage='PRIVATE' then
   update public.clocktower_live_rooms set day_stage='NOMINATIONS',activity_revision=activity_revision+1 where id=r.id;
  else
   select max(n) into top_count from (select (select count(*) from jsonb_each(ballots) b where b.value='true'::jsonb) n from public.clocktower_live_votes where room_id=r.id and day=r.night and status='DONE') x;
   select count(*) into leaders from public.clocktower_live_votes v where v.room_id=r.id and v.day=r.night and v.status='DONE' and (select count(*) from jsonb_each(v.ballots) b where b.value='true'::jsonb)=top_count;
   if leaders=1 then select nominee into candidate from public.clocktower_live_votes v where v.room_id=r.id and v.day=r.night and v.status='DONE' and top_count>=v.threshold and (select count(*) from jsonb_each(v.ballots) b where b.value='true'::jsonb)=top_count;end if;
   if candidate is not null then perform public.clocktower_execute(r.id,candidate);
   elsif (select count(*) from public.clocktower_live_members where room_id=r.id and alive)=3 and exists(select 1 from public.clocktower_live_members where room_id=r.id and actual_role='시장' and public.clocktower_healthy(r.id,user_id)) then perform public.clocktower_end_game(r.id,'GOOD','처형 없이 낮을 마쳐 시장의 승리 조건을 충족했습니다.');
   end if;
   perform public.clocktower_check_winner(r.id);
   if (select phase from public.clocktower_live_rooms where id=r.id)<>'ENDED' then perform public.clocktower_live_command_v6(p_event_id,'phase',jsonb_build_object('room_id',r.id,'phase','NIGHT'));end if;
  end if;
  update public.clocktower_live_rooms set flow_revision=flow_revision+1 where id=r.id;return;
 end if;
 if p_action='phase' and p_data->>'phase'<>'ENDED' then raise exception '다음 페이즈 버튼으로 진행해 주세요.';end if;
 if p_action='engine_execution' then raise exception '처형은 다음 페이즈에서 자동으로 처리합니다.';end if;
 if p_action='vote_nominate' then
  if r.day_stage<>'NOMINATIONS' then raise exception '밀담을 마치고 전체 토론·지목 단계에서 지목해 주세요.';end if;
  perform public.clocktower_live_command_v6(p_event_id,p_action,p_data);
  select * into target from public.clocktower_live_members where room_id=r.id and user_id=(p_data->>'nominee')::uuid;
  if target.shown_role='성결자' and not r.virgin_used?target.user_id::text then
   update public.clocktower_live_rooms set virgin_used=virgin_used||jsonb_build_object(target.user_id::text,true) where id=r.id;
   nom:=case when r.storyteller_id=auth.uid() then (p_data->>'nominator')::uuid else auth.uid() end;
   select * into actor from public.clocktower_live_members where room_id=r.id and user_id=nom;
   perceived:=actor.actual_role;
   if actor.actual_role='첩자' and public.clocktower_healthy(r.id,nom) then perceived:=coalesce(r.night_engine->'information'->'registrations'->>nom::text,actor.actual_role);end if;
   if target.actual_role='성결자' and public.clocktower_healthy(r.id,target.user_id) and perceived=any(towns) then
    update public.clocktower_live_votes set status='CANCELLED' where room_id=r.id and status in ('WAITING','RUNNING');
    perform public.clocktower_execute(r.id,nom);
    if (select phase from public.clocktower_live_rooms where id=r.id)<>'ENDED' then perform public.clocktower_live_command_v6(p_event_id,'phase',jsonb_build_object('room_id',r.id,'phase','NIGHT'));end if;
    update public.clocktower_live_rooms set flow_revision=flow_revision+1 where id=r.id;
   end if;
  end if;return;
 end if;
 perform public.clocktower_live_command_v6(p_event_id,p_action,p_data);
 if p_action in ('engine_approve','member') and r.phase<>'SETUP' then perform public.clocktower_check_winner(r.id);end if;
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
