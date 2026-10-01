-- Extend only boardgame group/play management, not general event administration.
begin;
create or replace function public.can_manage_boardgame_groups(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    coalesce(public.can_operate_event(p_event_id), false)
    or (coalesce(public.current_site_role() = 'RULE_MASTER', false)
        and exists (select 1 from public.events where id = p_event_id and event_kind = 'BOARDGAME'))
  );
$$;
revoke all on function public.can_manage_boardgame_groups(uuid) from public, anon;
grant execute on function public.can_manage_boardgame_groups(uuid) to authenticated;

create or replace function public.can_manage_event_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_groups g where g.id = p_group_id
    and public.can_manage_boardgame_groups(g.event_id));
$$;

create or replace function public.can_manage_event_play(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_boardgame_groups(p_event_id)
    or exists (select 1 from public.event_groups g where g.event_id = p_event_id and g.rule_master_user_id = auth.uid());
$$;

create or replace function public.can_manage_event_round(p_session_id uuid, p_group_id uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_game_sessions s where s.id = p_session_id and (
    public.can_manage_boardgame_groups(s.event_id)
    or (p_group_id is not null and exists (select 1 from public.event_groups g
        where g.id = p_group_id and g.event_id = s.event_id and g.rule_master_user_id = auth.uid()))
  ));
$$;

alter policy "event operators insert groups" on public.event_groups
  with check (public.can_manage_boardgame_groups(event_id));
alter policy "event operators update groups" on public.event_groups
  using (public.can_manage_boardgame_groups(event_id)) with check (public.can_manage_boardgame_groups(event_id));
alter policy "event operators delete groups" on public.event_groups
  using (public.can_manage_boardgame_groups(event_id));
alter policy "event operators update sessions" on public.event_game_sessions
  using (public.can_manage_boardgame_groups(event_id)) with check (public.can_manage_boardgame_groups(event_id));
alter policy "event operators delete sessions" on public.event_game_sessions
  using (public.can_manage_boardgame_groups(event_id));
commit;
