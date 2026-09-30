create or replace function public.tichu_exchange_pending(p_room uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.tichu_rooms r
      where r.id = p_room and r.status = 'EXCHANGE'
    ) then '[]'::jsonb
    else coalesce(jsonb_agg(to_jsonb(p.user_id::text) order by p.seat), '[]'::jsonb)
  end
  from public.tichu_players p
  left join public.tichu_exchanges e
    on e.room_id = p.room_id and e.user_id = p.user_id
  where p.room_id = p_room
    and (e.user_id is null or (select count(*) from jsonb_object_keys(e.gifts)) < 3)
    and (
      exists (
        select 1 from public.tichu_players mine
        where mine.room_id = p_room and mine.user_id = auth.uid()
      )
      or exists (
        select 1 from public.tichu_spectators s
        where s.room_id = p_room and s.user_id = auth.uid()
      )
    );
$$;

revoke all on function public.tichu_exchange_pending(uuid) from public, anon;
grant execute on function public.tichu_exchange_pending(uuid) to authenticated;
