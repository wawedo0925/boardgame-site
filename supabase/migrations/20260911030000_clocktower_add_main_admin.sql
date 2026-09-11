begin;
alter function public.clocktower_event_plays_command(uuid,text,jsonb) rename to clocktower_event_plays_command_before_main_admin;
revoke all on function public.clocktower_event_plays_command_before_main_admin(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_event_plays_command(p_event_id uuid,p_action text default 'list',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if p_action='add' then
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
  if public.current_site_role() is distinct from 'MAIN_ADMIN'
   and (exists(select 1 from public.clocktower_event_plays where event_id=p_event_id)
    or exists(select 1 from public.clocktower_live_rooms where event_id=p_event_id)) then
   raise exception '한판 더는 메인 관리자만 사용할 수 있습니다.';
  end if;
 end if;
 return public.clocktower_event_plays_command_before_main_admin(p_event_id,p_action,p_data);
end $$;
revoke all on function public.clocktower_event_plays_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_event_plays_command(uuid,text,jsonb) to authenticated;
commit;
