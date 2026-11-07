begin;
alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_before_role_transfer;
revoke all on function public.clocktower_live_command_before_role_transfer(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms;
begin
 if p_action='bmr_assign_role' then
  if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
  select * into r from public.clocktower_live_rooms where scope_id=p_event_id order by created_at desc,id desc limit 1 for update;
  if r.id is null or r.id::text is distinct from p_data->>'room_id' or r.storyteller_id is distinct from auth.uid() or r.script<>'BMR' or r.phase<>'SETUP' or r.roles_released or r.bmr_revision is distinct from (p_data->>'bmr_revision')::integer then
   raise exception '역할 배포 전 이야기꾼만 최신 배정안을 저장할 수 있습니다.';
  end if;
  -- Transfer and assignment are atomic. The existing command validates the recipient,
  -- role, shown role and flags; any error rolls back the cleared assignment too.
  update public.clocktower_live_members set actual_role='',shown_role='',role_confirmed=false,
   bmr='{"life":"ALIVE","faction":"GOOD","drunk":false,"poisoned":false,"protected":false,"spent":false}'::jsonb
   where room_id=r.id and user_id::text<>p_data->>'user_id' and actual_role=p_data->>'actual_role';
  perform public.clocktower_live_command_before_role_transfer(p_event_id,'bmr_member',p_data);
  return;
 end if;
 perform public.clocktower_live_command_before_role_transfer(p_event_id,p_action,p_data);
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
