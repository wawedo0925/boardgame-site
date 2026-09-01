-- Keep attendance permissions aligned with the event management UI.
-- MAIN_ADMIN, ADMIN, the event creator, and assigned operators are resolved by
-- can_operate_event(), so attendance does not depend on who created the event.

drop function if exists public.set_event_attendance(uuid, uuid, text);
drop function if exists public.mark_all_event_participants_present(uuid);

create or replace function public.set_event_attendance(
  p_event_id uuid,
  p_user_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.can_operate_event(p_event_id) then
    raise exception '출석을 관리할 권한이 없습니다.';
  end if;

  if p_status not in ('REGISTERED', 'PRESENT', 'ABSENT') then
    raise exception '유효하지 않은 출석 상태입니다.';
  end if;

  update public.event_participants
  set attendance_status = p_status,
      attendance_checked_at = now()
  where event_id = p_event_id
    and user_id = p_user_id;

  if not found then
    raise exception '해당 이벤트의 참가자를 찾을 수 없습니다.';
  end if;
end;
$$;

create or replace function public.mark_all_event_participants_present(
  p_event_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.can_operate_event(p_event_id) then
    raise exception '출석을 관리할 권한이 없습니다.';
  end if;

  update public.event_participants
  set attendance_status = 'PRESENT',
      attendance_checked_at = now()
  where event_id = p_event_id
    and coalesce(attendance_status, 'REGISTERED') = 'REGISTERED';
end;
$$;

revoke all on function public.set_event_attendance(uuid, uuid, text) from public, anon;
grant execute on function public.set_event_attendance(uuid, uuid, text) to authenticated;

revoke all on function public.mark_all_event_participants_present(uuid) from public, anon;
grant execute on function public.mark_all_event_participants_present(uuid) to authenticated;
