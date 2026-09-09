begin;
-- Deferring this constraint permits an atomic exchange of occupied seats.
alter table public.clocktower_live_members drop constraint clocktower_live_members_room_id_seat_key;
alter table public.clocktower_live_members add constraint clocktower_live_members_room_id_seat_key unique(room_id,seat) deferrable initially immediate;
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
  return jsonb_build_object('room',jsonb_build_object('id',r.id,'phase',r.phase,'night',r.night),'is_host',host,
    'my_id',auth.uid(),'members',roster,'requests',result,'candidates',coalesce(candidates,'[]'::jsonb));
end $$;


-- Preserve the existing adjudication API behind an authenticated wrapper.
alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_v1;
revoke all on function public.clocktower_live_command_v1(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; candidate record; position integer; first_seat integer; second_seat integer; a uuid; b uuid;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 if p_action='create' then
  perform public.clocktower_live_command_v1(p_event_id,p_action,p_data);
 end if;
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if p_action<>'create' and (r.id is null or r.id::text is distinct from p_data->>'room_id') then raise exception '진행방이 바뀌었습니다. 새로고침해 주세요.'; end if;
 if p_action in ('create','sync_participants','swap_seats') then
  if r.storyteller_id is distinct from auth.uid() then raise exception '이야기꾼만 자리를 배치할 수 있습니다.'; end if;
  if r.phase<>'SETUP' then raise exception '자리는 첫날 밤을 시작하기 전에 배치해 주세요.'; end if;
  if p_action='swap_seats' then
   a:=(p_data->>'first_user_id')::uuid; b:=(p_data->>'second_user_id')::uuid;
   select seat into first_seat from public.clocktower_live_members where room_id=r.id and user_id=a;
   select seat into second_seat from public.clocktower_live_members where room_id=r.id and user_id=b;
   if first_seat is null or second_seat is null or a=b then raise exception '자리를 바꿀 두 참가자를 선택해 주세요.'; end if;
   if first_seat is distinct from (p_data->>'first_seat')::integer or second_seat is distinct from (p_data->>'second_seat')::integer then raise exception '자리 배치가 변경되었습니다. 다시 선택해 주세요.'; end if;
   set constraints clocktower_live_members_room_id_seat_key deferred;
   update public.clocktower_live_members set seat=case when user_id=a then second_seat else first_seat end where room_id=r.id and user_id in (a,b);
   set constraints clocktower_live_members_room_id_seat_key immediate;
  else
   for candidate in select ep.user_id from public.event_participants ep left join public.profiles p on p.id=ep.user_id where ep.event_id=p_event_id and ep.user_id<>r.storyteller_id and not exists(select 1 from public.clocktower_live_members m where m.room_id=r.id and m.user_id=ep.user_id) order by p.activity_name,ep.user_id loop
    select s into position from generate_series(1,20) s where not exists(select 1 from public.clocktower_live_members where room_id=r.id and seat=s) order by s limit 1;
    if position is null then raise exception '진행방에는 최대 20명까지 자리를 배치할 수 있습니다.'; end if;
    insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role) values(r.id,candidate.user_id,position,'','');
   end loop;
  end if;
  return;
 end if;
 if p_action='phase' and p_data->>'phase'='NIGHT' and r.phase='SETUP' then
  if r.storyteller_id is distinct from auth.uid() then raise exception '이야기꾼만 진행할 수 있습니다.'; end if;
  if exists(select 1 from public.clocktower_live_members where room_id=r.id and (actual_role='' or shown_role='')) then raise exception '모든 참가자의 역할을 배정한 뒤 시작해 주세요.'; end if;
 end if;
 -- Once play starts the neighbour order must remain stable.
 if p_action='member' and r.phase<>'SETUP' and exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id=(p_data->>'user_id')::uuid and seat is distinct from (p_data->>'seat')::integer) then raise exception '게임 시작 후에는 자리를 바꿀 수 없습니다.'; end if;
 perform public.clocktower_live_command_v1(p_event_id,p_action,p_data);
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
