begin;

create or replace function public.yut_auto_act(p_room uuid, p_expected_revision bigint) returns void
language plpgsql security definer set search_path=public as $$
declare
  r yut_rooms%rowtype;
  actor yut_players%rowtype;
  chosen_piece int;
  chosen_index int;
  idx int;
  mv int;
begin
  select * into r from yut_rooms where id=p_room for update;
  if not found or r.status<>'PLAYING' or r.revision<>p_expected_revision then return; end if;

  select * into actor from yut_players where room_id=p_room and seat=r.turn_seat;
  if not found or actor.is_bot or actor.user_id<>auth.uid() then return; end if;

  if r.can_roll then
    perform public.yut_roll(p_room,false);
    return;
  end if;
  if cardinality(r.pending_moves)=0 then return; end if;

  for idx in 1..cardinality(r.pending_moves) loop
    mv:=r.pending_moves[idx];
    select p.piece_no,idx into chosen_piece,chosen_index
    from yut_pieces p
    where p.room_id=p_room
      and p.team=actor.team
      and public.yut_node(p.route,p.step_index)<>99
      and not(mv<0 and p.step_index=0)
    order by
      (case when public.yut_node(p.route,p.step_index+mv)=99 then 10000 else 0 end)+
      (case when exists(
        select 1 from yut_pieces opponent
        where opponent.room_id=p_room
          and opponent.team<>actor.team
          and public.yut_node(opponent.route,opponent.step_index)=public.yut_node(p.route,p.step_index+mv)
      ) then 1000 else 0 end)+
      (case when public.yut_node(p.route,p.step_index) in (5,10) then 200 else 0 end)+
      p.step_index desc
    limit 1;
    exit when chosen_piece is not null;
  end loop;

  if chosen_piece is null then
    update yut_rooms
    set pending_moves='{}',can_roll=true,turn_seat=(turn_seat+1)%max_players,revision=revision+1,updated_at=now()
    where id=p_room;
  else
    perform public.yut_move(p_room,chosen_piece,chosen_index,false);
  end if;
end $$;

revoke all on function public.yut_auto_act(uuid,bigint) from public,anon;
grant execute on function public.yut_auto_act(uuid,bigint) to authenticated;

commit;
