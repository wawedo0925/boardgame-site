begin;
alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_before_tb_transfer;
revoke all on function public.clocktower_live_command_before_tb_transfer(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; current_rows jsonb; expected jsonb;
begin
 if p_action='tb_assign_role' then
  if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
  select * into r from public.clocktower_live_rooms where scope_id=p_event_id order by created_at desc,id desc limit 1 for update;
  if r.id is null or r.id::text is distinct from p_data->>'room_id' or r.storyteller_id is distinct from auth.uid() or r.script<>'TB' or r.phase<>'SETUP' or r.roles_released then
   raise exception '역할 배포 전 이야기꾼만 배정안을 저장할 수 있습니다.';
  end if;
  expected:=p_data->'expected';
  if jsonb_typeof(expected) is distinct from 'array' then raise exception '이전 배정안이 필요합니다.';end if;
  select coalesce(jsonb_agg(x order by x->>'user_id'),'[]') into expected from jsonb_array_elements(expected) x;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'actual_role',actual_role,'shown_role',shown_role) order by user_id::text),'[]') into current_rows from public.clocktower_live_members where room_id=r.id;
  if current_rows is distinct from expected then raise exception '역할이 변경되었습니다. 닫은 후 다시 편집해 주세요.';end if;
  update public.clocktower_live_members set actual_role='',shown_role='',role_confirmed=false
   where room_id=r.id and user_id::text<>p_data->>'user_id'
    and (actual_role=p_data->>'actual_role' or shown_role=p_data->>'shown_role');
  perform public.clocktower_live_command_before_tb_transfer(p_event_id,'member',p_data);
  return;
 end if;
 perform public.clocktower_live_command_before_tb_transfer(p_event_id,p_action,p_data);
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
