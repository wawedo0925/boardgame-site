begin;
alter table public.clocktower_live_rooms add column seating_layout jsonb not null default '{}', add column seating_revision integer not null default 0;
create or replace function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb
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
  select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(p.activity_name,'회원'),'birth_year',p.birth_year,'seat',m.seat,
    'alive',case when host then m.alive else m.public_alive end) ||
    case when host then jsonb_build_object('actual_role',m.actual_role,'shown_role',m.shown_role,'notes',m.notes)
    when m.user_id=auth.uid() and r.phase<>'SETUP' then jsonb_build_object('shown_role',m.shown_role)
    else '{}'::jsonb end order by m.seat),'[]'::jsonb) into roster
  from public.clocktower_live_members m left join public.profiles p on p.id=m.user_id where m.room_id=r.id;
  if host then
    select coalesce(jsonb_agg(jsonb_build_object('user_id',ep.user_id,'name',coalesce(p.activity_name,'회원'),'birth_year',p.birth_year) order by p.activity_name),'[]'::jsonb) into candidates
    from public.event_participants ep left join public.profiles p on p.id=ep.user_id where ep.event_id=p_event_id and ep.user_id<>r.storyteller_id;
  end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc),'[]'::jsonb) into result
  from public.clocktower_live_requests q where q.room_id=r.id and (host or q.user_id=auth.uid());
  return jsonb_build_object('room',jsonb_build_object('id',r.id,'phase',r.phase,'night',r.night,'seating_layout',r.seating_layout,'seating_revision',r.seating_revision),'is_host',host,
    'my_id',auth.uid(),'members',roster,'requests',result,'candidates',coalesce(candidates,'[]'::jsonb));
end $$;



create function public.clocktower_save_layout(p_event_id uuid,p_room_id uuid,p_revision integer,p_layout jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; point record; roster_count integer;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if r.id is null or r.id is distinct from p_room_id then raise exception '진행방이 바뀌었습니다. 다시 입장해 주세요.'; end if;
 if r.storyteller_id is distinct from auth.uid() then raise exception '이야기꾼만 배치를 저장할 수 있습니다.'; end if;
 if r.phase<>'SETUP' then raise exception '배치는 첫날 밤을 시작하기 전에 저장해 주세요.'; end if;
 if p_revision is distinct from r.seating_revision then raise exception '다른 화면에서 배치가 바뀌었습니다. 취소 후 다시 편집해 주세요.'; end if;
 if p_layout is null or jsonb_typeof(p_layout)<>'object' then raise exception '올바른 배치를 전달해 주세요.'; end if;
 select count(*) into roster_count from public.clocktower_live_members where room_id=r.id;
 if (select count(*) from jsonb_object_keys(p_layout))<>roster_count then raise exception '참가자가 변경되었습니다. 취소 후 다시 편집해 주세요.'; end if;
 for point in select key,value from jsonb_each(p_layout) loop
  if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id::text=point.key) then raise exception '진행방 참가자만 배치할 수 있습니다.'; end if;
  if jsonb_typeof(point.value)<>'object' or jsonb_typeof(point.value->'x') is distinct from 'number' or jsonb_typeof(point.value->'y') is distinct from 'number' then raise exception '자리 좌표를 확인해 주세요.'; end if;
  if (select count(*) from jsonb_object_keys(point.value))<>2 then raise exception '좌표 외의 값은 저장할 수 없습니다.'; end if;
  if (point.value->>'x')::numeric not between 60 and 940 or (point.value->>'y')::numeric not between 40 and 660 then raise exception '카드를 배치판 안에 놓아 주세요.'; end if;
 end loop;
 update public.clocktower_live_rooms set seating_layout=p_layout,seating_revision=seating_revision+1 where id=r.id;
end $$;
revoke all on function public.clocktower_save_layout(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.clocktower_save_layout(uuid,uuid,integer,jsonb) to authenticated;
commit;
