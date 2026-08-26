-- Event creators and operators can remove participants or waitlisted members
-- before an event starts. When a confirmed participant leaves, promote the
-- first waitlisted member automatically.

create or replace function public.remove_event_member(
  p_event_id uuid,
  p_user_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.events%rowtype;
  promoted_user_id uuid;
  removed_kind text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into target
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception '이벤트를 찾을 수 없습니다.';
  end if;
  if target.started_at <= now() or target.event_status <> 'OPEN' then
    raise exception '시작되었거나 종료된 이벤트의 참가자는 변경할 수 없습니다.';
  end if;
  if not public.can_operate_event(p_event_id) then
    raise exception '참가자 관리 권한이 없습니다.';
  end if;
  if p_user_id = target.created_by then
    raise exception '이벤트 생성자는 참가자에서 제외할 수 없습니다.';
  end if;

  if exists (
    select 1 from public.event_participants
    where event_id = p_event_id and user_id = p_user_id
  ) then
    removed_kind := 'PARTICIPANT';

    delete from public.event_round_players
    where user_id = p_user_id
      and round_id in (
        select r.id
        from public.event_game_rounds r
        join public.event_game_sessions s on s.id = r.session_id
        where s.event_id = p_event_id
      );
    delete from public.event_group_members
    where user_id = p_user_id
      and group_id in (select id from public.event_groups where event_id = p_event_id);
    delete from public.event_staff where event_id = p_event_id and user_id = p_user_id;
    delete from public.event_participants where event_id = p_event_id and user_id = p_user_id;

    select user_id into promoted_user_id
    from public.event_waitlist
    where event_id = p_event_id
    order by joined_at
    limit 1
    for update skip locked;

    if promoted_user_id is not null then
      delete from public.event_waitlist
      where event_id = p_event_id and user_id = promoted_user_id;

      insert into public.event_participants(event_id, user_id, participation_role)
      values (p_event_id, promoted_user_id, 'PLAYER')
      on conflict do nothing;

      insert into public.notifications(recipient_id, type, title, message, link)
      values (
        promoted_user_id,
        'EVENT_WAITLIST_PROMOTED',
        '이벤트 참가 확정',
        target.title || ' 이벤트의 참가자로 확정되었습니다.',
        '/events/' || target.id
      );
    end if;
  elsif exists (
    select 1 from public.event_waitlist
    where event_id = p_event_id and user_id = p_user_id
  ) then
    removed_kind := 'WAITLIST';
    delete from public.event_waitlist where event_id = p_event_id and user_id = p_user_id;
  else
    raise exception '해당 멤버는 참가자 또는 대기자가 아닙니다.';
  end if;

  insert into public.notifications(recipient_id, type, title, message, link)
  values (
    p_user_id,
    'EVENT_PARTICIPATION_REMOVED',
    '이벤트 참가 변경',
    target.title || case when removed_kind = 'WAITLIST' then ' 이벤트의 대기 신청이 관리자에 의해 취소되었습니다.' else ' 이벤트 참가가 관리자에 의해 취소되었습니다.' end,
    '/events/' || target.id
  );

  return removed_kind;
end;
$$;

revoke all on function public.remove_event_member(uuid, uuid) from public, anon;
grant execute on function public.remove_event_member(uuid, uuid) to authenticated;
