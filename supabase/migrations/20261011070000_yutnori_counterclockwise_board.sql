begin;

create or replace function public.yut_node(p_route text, p_step int) returns int
language plpgsql immutable as $$
declare path int[];
begin
  if p_step<=0 then return 0; end if;
  if p_route='diag1' then path:=array[0,1,2,3,4,5,21,29,22,23,24,15,16,17,18,19,20,99];
  elsif p_route='diag2' then path:=array[0,1,2,3,4,5,6,7,8,9,10,25,26,22,27,28,20,99];
  else path:=array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,99]; end if;
  if p_step+1>cardinality(path) then return 99; end if;
  return path[p_step+1];
end $$;

create or replace function public.yut_move(p_room uuid,p_piece int,p_move_index int,p_bot boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; actor yut_players%rowtype; pc yut_pieces%rowtype; mv int; route2 text; step2 int; node0 int; node2 int; captured boolean:=false; finished_count int; nextseat int; remaining int[];
begin
  select * into r from yut_rooms where id=p_room for update;
  select * into actor from yut_players where room_id=p_room and seat=r.turn_seat;
  if r.status<>'PLAYING' or cardinality(r.pending_moves)=0 then raise exception '움직일 윷 결과가 없습니다.'; end if;
  if (not p_bot and actor.user_id<>auth.uid()) or (p_bot and not actor.is_bot) then raise exception '지금은 내 차례가 아닙니다.'; end if;
  if p_move_index<1 or p_move_index>cardinality(r.pending_moves) then raise exception '윷 결과를 다시 선택해 주세요.'; end if;
  mv:=r.pending_moves[p_move_index];
  select * into pc from yut_pieces where room_id=p_room and team=actor.team and piece_no=p_piece for update;
  if not found or public.yut_node(pc.route,pc.step_index)=99 then raise exception '움직일 수 없는 말입니다.'; end if;
  if mv<0 and pc.step_index=0 then raise exception '빽도로 새 말을 출발시킬 수 없습니다.'; end if;
  route2:=pc.route; step2:=greatest(0,pc.step_index+mv); node0:=public.yut_node(pc.route,pc.step_index);
  if mv>0 and pc.route='outer' and node0=5 then route2:='diag1'; step2:=5+mv;
  elsif mv>0 and pc.route='outer' and node0=10 then route2:='diag2'; step2:=10+mv; end if;
  node2:=public.yut_node(route2,step2);
  if node2=99 then step2:=case when route2='diag1' then 17 when route2='diag2' then 17 else 21 end; end if;
  if node0=0 then update yut_pieces set route=route2,step_index=step2 where room_id=p_room and team=actor.team and piece_no=p_piece;
  else update yut_pieces set route=route2,step_index=step2 where room_id=p_room and team=actor.team and public.yut_node(route,step_index)=node0; end if;
  if node2 not in (0,99) and exists(select 1 from yut_pieces where room_id=p_room and team<>actor.team and public.yut_node(route,step_index)=node2) then
    captured:=true; update yut_pieces set route='outer',step_index=0 where room_id=p_room and team<>actor.team and public.yut_node(route,step_index)=node2;
  end if;
  remaining:=coalesce(r.pending_moves[1:p_move_index-1],'{}')||coalesce(r.pending_moves[p_move_index+1:cardinality(r.pending_moves)],'{}');
  select count(*) into finished_count from yut_pieces where room_id=p_room and team=actor.team and public.yut_node(route,step_index)=99;
  if finished_count=4 then update yut_rooms set status='FINISHED',winner_team=actor.team,turn_seat=null,pending_moves='{}',can_roll=false,revision=revision+1,updated_at=now() where id=p_room; return; end if;
  if cardinality(remaining)>0 then update yut_rooms set pending_moves=remaining,can_roll=(can_roll or captured),revision=revision+1 where id=p_room;
  elsif captured or r.can_roll then update yut_rooms set pending_moves='{}',can_roll=true,revision=revision+1 where id=p_room;
  else nextseat:=(r.turn_seat+1)%r.max_players; update yut_rooms set turn_seat=nextseat,pending_moves='{}',can_roll=true,last_roll=null,revision=revision+1,updated_at=now() where id=p_room; end if;
end $$;

commit;
