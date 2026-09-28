begin;

create or replace function public.tichu_leave_room(p_room uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare room_row public.tichu_rooms%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into room_row from public.tichu_rooms where id=p_room for update;
  if not found then return; end if;
  if not exists(select 1 from public.tichu_players where room_id=p_room and user_id=auth.uid()) then return; end if;

  if room_row.status='WAITING' then
    if room_row.host_id=auth.uid() then
      delete from public.tichu_rooms where id=p_room;
    else
      delete from public.tichu_players where room_id=p_room and user_id=auth.uid();
      update public.tichu_rooms set revision=revision+1,updated_at=now() where id=p_room;
    end if;
  else
    update public.tichu_rooms
    set status='FINISHED',turn_seat=null,turn_deadline=null,winner_team=null,
        revision=revision+1,updated_at=now()
    where id=p_room;
    delete from public.tichu_players where room_id=p_room and user_id=auth.uid();
  end if;
end $$;

revoke all on function public.tichu_leave_room(uuid) from public,anon;
grant execute on function public.tichu_leave_room(uuid) to authenticated;

commit;
