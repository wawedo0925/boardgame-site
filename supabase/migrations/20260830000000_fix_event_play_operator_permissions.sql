-- Let event operators save all group assignments, and let an assigned rule
-- master manage game rounds/results for their own group only.

create or replace function public.can_manage_event_group(
  p_group_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_groups event_group
    where event_group.id = p_group_id
      and public.can_operate_event(event_group.event_id)
  );
$$;

create or replace function public.can_manage_event_play(
  p_event_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_operate_event(p_event_id)
    or exists (
      select 1
      from public.event_groups event_group
      where event_group.event_id = p_event_id
        and event_group.rule_master_user_id = auth.uid()
    );
$$;

create or replace function public.can_manage_event_round(
  p_session_id uuid,
  p_group_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_game_sessions session
    where session.id = p_session_id
      and (
        public.can_operate_event(session.event_id)
        or (
          p_group_id is not null
          and exists (
            select 1
            from public.event_groups event_group
            where event_group.id = p_group_id
              and event_group.event_id = session.event_id
              and event_group.rule_master_user_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.can_manage_event_round_player(
  p_round_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_game_rounds round
    where round.id = p_round_id
      and public.can_manage_event_round(round.session_id, round.group_id)
  );
$$;

revoke all on function public.can_manage_event_group(uuid) from public, anon;
grant execute on function public.can_manage_event_group(uuid) to authenticated;

revoke all on function public.can_manage_event_play(uuid) from public, anon;
grant execute on function public.can_manage_event_play(uuid) to authenticated;

revoke all on function public.can_manage_event_round(uuid, uuid) from public, anon;
grant execute on function public.can_manage_event_round(uuid, uuid) to authenticated;

revoke all on function public.can_manage_event_round_player(uuid) from public, anon;
grant execute on function public.can_manage_event_round_player(uuid) to authenticated;

alter table public.event_groups enable row level security;
alter table public.event_group_members enable row level security;
alter table public.event_game_sessions enable row level security;
alter table public.event_game_rounds enable row level security;
alter table public.event_round_players enable row level security;

drop policy if exists "event operators insert groups" on public.event_groups;
create policy "event operators insert groups"
  on public.event_groups for insert to authenticated
  with check (public.can_operate_event(event_id));

drop policy if exists "event operators update groups" on public.event_groups;
create policy "event operators update groups"
  on public.event_groups for update to authenticated
  using (public.can_operate_event(event_id))
  with check (public.can_operate_event(event_id));

drop policy if exists "event operators delete groups" on public.event_groups;
create policy "event operators delete groups"
  on public.event_groups for delete to authenticated
  using (public.can_operate_event(event_id));

drop policy if exists "event operators insert group members" on public.event_group_members;
create policy "event operators insert group members"
  on public.event_group_members for insert to authenticated
  with check (public.can_manage_event_group(group_id));

drop policy if exists "event operators update group members" on public.event_group_members;
create policy "event operators update group members"
  on public.event_group_members for update to authenticated
  using (public.can_manage_event_group(group_id))
  with check (public.can_manage_event_group(group_id));

drop policy if exists "event operators delete group members" on public.event_group_members;
create policy "event operators delete group members"
  on public.event_group_members for delete to authenticated
  using (public.can_manage_event_group(group_id));

-- A rule master needs to create the shared game session before adding the
-- first round. Session update/delete remains restricted to event operators.
drop policy if exists "event play managers insert sessions" on public.event_game_sessions;
create policy "event play managers insert sessions"
  on public.event_game_sessions for insert to authenticated
  with check (public.can_manage_event_play(event_id));

drop policy if exists "event operators update sessions" on public.event_game_sessions;
create policy "event operators update sessions"
  on public.event_game_sessions for update to authenticated
  using (public.can_operate_event(event_id))
  with check (public.can_operate_event(event_id));

drop policy if exists "event operators delete sessions" on public.event_game_sessions;
create policy "event operators delete sessions"
  on public.event_game_sessions for delete to authenticated
  using (public.can_operate_event(event_id));

drop policy if exists "event operators create rounds" on public.event_game_rounds;
create policy "event operators create rounds"
  on public.event_game_rounds for insert to authenticated
  with check (public.can_manage_event_round(session_id, group_id));

drop policy if exists "event operators update rounds" on public.event_game_rounds;
create policy "event operators update rounds"
  on public.event_game_rounds for update to authenticated
  using (public.can_manage_event_round(session_id, group_id))
  with check (public.can_manage_event_round(session_id, group_id));

drop policy if exists "event operators delete rounds" on public.event_game_rounds;
create policy "event operators delete rounds"
  on public.event_game_rounds for delete to authenticated
  using (public.can_manage_event_round(session_id, group_id));

drop policy if exists "event operators create round players" on public.event_round_players;
create policy "event operators create round players"
  on public.event_round_players for insert to authenticated
  with check (public.can_manage_event_round_player(round_id));

drop policy if exists "event operators update round players" on public.event_round_players;
create policy "event operators update round players"
  on public.event_round_players for update to authenticated
  using (public.can_manage_event_round_player(round_id))
  with check (public.can_manage_event_round_player(round_id));

drop policy if exists "event operators delete round players" on public.event_round_players;
create policy "event operators delete round players"
  on public.event_round_players for delete to authenticated
  using (public.can_manage_event_round_player(round_id));
