-- Confirmed party-GM participants can arrange every group in their own boardgame event.
-- Keep event administration and other groups' play-record permissions unchanged.
begin;
create or replace function public.can_arrange_boardgame_groups(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    coalesce(public.can_manage_boardgame_groups(p_event_id), false)
    or exists (
      select 1 from public.events e
      join public.event_party_gm_requests r on r.event_id = e.id
      join public.event_participants p on p.event_id = r.event_id and p.user_id = r.user_id
      where e.id = p_event_id and e.event_kind = 'BOARDGAME' and r.user_id = auth.uid()
    )
  );
$$;
revoke all on function public.can_arrange_boardgame_groups(uuid) from public, anon;
grant execute on function public.can_arrange_boardgame_groups(uuid) to authenticated;

create or replace function public.can_manage_event_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_groups g where g.id = p_group_id
    and public.can_arrange_boardgame_groups(g.event_id));
$$;

alter policy "event operators insert groups" on public.event_groups
  with check (public.can_arrange_boardgame_groups(event_id));
alter policy "event operators update groups" on public.event_groups
  using (public.can_arrange_boardgame_groups(event_id))
  with check (public.can_arrange_boardgame_groups(event_id));
alter policy "event operators delete groups" on public.event_groups
  using (public.can_arrange_boardgame_groups(event_id));
commit;
