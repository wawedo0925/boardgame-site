create or replace function public.tichu_spectator_names(p_room uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not (
      exists (
        select 1 from public.tichu_players p
        where p.room_id = p_room and p.user_id = auth.uid()
      )
      or exists (
        select 1 from public.tichu_spectators mine
        where mine.room_id = p_room and mine.user_id = auth.uid()
      )
    ) then '[]'::jsonb
    else coalesce(
      jsonb_agg(to_jsonb(coalesce(pr.activity_name, '멤버')) order by s.joined_at),
      '[]'::jsonb
    )
  end
  from public.tichu_spectators s
  left join public.profiles pr on pr.id = s.user_id
  where s.room_id = p_room;
$$;

revoke all on function public.tichu_spectator_names(uuid) from public, anon;
grant execute on function public.tichu_spectator_names(uuid) to authenticated;
