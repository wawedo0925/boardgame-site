alter table public.yut_pieces
  add column if not exists back_at_start boolean not null default false;

create or replace function public.yut_move(p_room uuid,p_piece int,p_move_index int,p_bot boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; actor yut_players%rowtype; pc yut_pieces%rowtype; mv int; route2 text; step2 int; node0 int; node2 int; captured boolean:=false; finished_count int; nextseat int; remaining int[]; returned_start boolean:=false;
begin
  select * into r from yut_rooms where id=p_room for update;
  select * into actor from yut_players where room_id=p_room and seat=r.turn_seat;
  if r.status<>'PLAYING' or cardinality(r.pending_moves)=0 then raise exception '움직일 윷 결과가 없습니다.'; end if;
  if (not p_bot and actor.user_id<>auth.uid()) or (p_bot and not actor.is_bot) then raise exception '지금은 내 차례가 아닙니다.'; end if;
  if p_move_index<1 or p_move_index>cardinality(r.pending_moves) then raise exception '윷 결과를 다시 선택해 주세요.'; end if;
  mv:=r.pending_moves[p_move_index];
  select * into pc from yut_pieces where room_id=p_room and team=actor.team and piece_no=p_piece for update;
  if not found or public.yut_node(pc.route,pc.step_index)=99 then raise exception '움직일 수 없는 말입니다.'; end if;
  if mv<0 and pc.step_index=0 and not pc.back_at_start then raise exception '빽도로 새 말을 출발시킬 수 없습니다.'; end if;
  node0:=public.yut_node(pc.route,pc.step_index);
  route2:=pc.route;
  if mv<0 and pc.step_index=0 and pc.back_at_start then
    route2:='outer'; step2:=21;
  else
    step2:=greatest(0,pc.step_index+mv);
    returned_start:=(mv<0 and pc.step_index=1 and step2=0);
    if mv>0 and pc.route='outer' and node0=5 then route2:='diag1'; step2:=5+mv;
    elsif mv>0 and pc.route='outer' and node0=10 then route2:='diag2'; step2:=10+mv; end if;
  end if;
  node2:=public.yut_node(route2,step2);
  if node2=99 then step2:=case when route2='diag1' then 17 when route2='diag2' then 17 else 21 end; end if;
  if node0=0 then
    update yut_pieces set route=route2,step_index=step2,back_at_start=returned_start where room_id=p_room and team=actor.team and piece_no=p_piece;
  else
    update yut_pieces set route=route2,step_index=step2,back_at_start=returned_start where room_id=p_room and team=actor.team and public.yut_node(route,step_index)=node0;
  end if;
  if node2 not in (0,99) and exists(select 1 from yut_pieces where room_id=p_room and team<>actor.team and public.yut_node(route,step_index)=node2) then
    captured:=true;
    update yut_pieces set route='outer',step_index=0,back_at_start=false where room_id=p_room and team<>actor.team and public.yut_node(route,step_index)=node2;
  end if;
  remaining:=coalesce(r.pending_moves[1:p_move_index-1],'{}')||coalesce(r.pending_moves[p_move_index+1:cardinality(r.pending_moves)],'{}');
  select count(*) into finished_count from yut_pieces where room_id=p_room and team=actor.team and public.yut_node(route,step_index)=99;
  if finished_count=4 then update yut_rooms set status='FINISHED',winner_team=actor.team,turn_seat=null,pending_moves='{}',can_roll=false,revision=revision+1,updated_at=now() where id=p_room; return; end if;
  if cardinality(remaining)>0 then update yut_rooms set pending_moves=remaining,can_roll=(can_roll or captured),revision=revision+1 where id=p_room;
  elsif captured or r.can_roll then update yut_rooms set pending_moves='{}',can_roll=true,revision=revision+1 where id=p_room;
  else nextseat:=(r.turn_seat+1)%r.max_players; update yut_rooms set turn_seat=nextseat,pending_moves='{}',can_roll=true,last_roll=null,revision=revision+1,updated_at=now() where id=p_room; end if;
end $$;

create or replace function public.yut_move_choice(p_room uuid,p_piece int,p_move_index int,p_center_route text,p_bot boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; actor yut_players%rowtype; pc yut_pieces%rowtype; mv int; route2 text; step2 int; node0 int; node2 int; captured boolean:=false; finished_count int; nextseat int; remaining int[]; returned_start boolean:=false;
begin
  select * into r from yut_rooms where id=p_room for update;
  select * into actor from yut_players where room_id=p_room and seat=r.turn_seat;
  if r.status<>'PLAYING' or cardinality(r.pending_moves)=0 then raise exception '움직일 윷 결과가 없습니다.'; end if;
  if (not p_bot and actor.user_id<>auth.uid()) or (p_bot and not actor.is_bot) then raise exception '지금은 내 차례가 아닙니다.'; end if;
  if p_move_index<1 or p_move_index>cardinality(r.pending_moves) then raise exception '윷 결과를 다시 선택해 주세요.'; end if;
  mv:=r.pending_moves[p_move_index];
  select * into pc from yut_pieces where room_id=p_room and team=actor.team and piece_no=p_piece for update;
  if not found or public.yut_node(pc.route,pc.step_index)=99 then raise exception '움직일 수 없는 말입니다.'; end if;
  if mv<0 and pc.step_index=0 and not pc.back_at_start then raise exception '빽도로 새 말을 출발시킬 수 없습니다.'; end if;
  node0:=public.yut_node(pc.route,pc.step_index);
  if mv<0 and pc.step_index=0 and pc.back_at_start then route2:='outer'; step2:=21;
  elsif node0=22 and mv>0 then
    if p_center_route='LEFT' then route2:='diag1'; step2:=8+mv;
    elsif p_center_route='RIGHT' then route2:='diag2'; step2:=13+mv;
    else raise exception '중앙에서 이동할 방향을 선택해 주세요.'; end if;
  elsif node0=5 and pc.route='outer' and mv>0 then
    if p_center_route='OUTER' then route2:='outer'; step2:=pc.step_index+mv;
    elsif p_center_route='DIAGONAL' then route2:='diag1'; step2:=5+mv;
    else raise exception '오른쪽 위에서 이동할 방향을 선택해 주세요.'; end if;
  elsif node0=10 and pc.route='outer' and mv>0 then
    if p_center_route='OUTER' then route2:='outer'; step2:=pc.step_index+mv;
    elsif p_center_route='DIAGONAL' then route2:='diag2'; step2:=10+mv;
    else raise exception '왼쪽 위에서 이동할 방향을 선택해 주세요.'; end if;
  else
    route2:=pc.route; step2:=greatest(0,pc.step_index+mv);
    returned_start:=(mv<0 and pc.step_index=1 and step2=0);
  end if;
  node2:=public.yut_node(route2,step2);
  if node2=99 then step2:=case when route2='diag1' then 17 when route2='diag2' then 17 else 21 end; end if;
  if node0=0 then update yut_pieces set route=route2,step_index=step2,back_at_start=returned_start where room_id=p_room and team=actor.team and piece_no=p_piece;
  else update yut_pieces set route=route2,step_index=step2,back_at_start=returned_start where room_id=p_room and team=actor.team and public.yut_node(route,step_index)=node0; end if;
  if node2 not in (0,99) and exists(select 1 from yut_pieces where room_id=p_room and team<>actor.team and public.yut_node(route,step_index)=node2) then
    captured:=true; update yut_pieces set route='outer',step_index=0,back_at_start=false where room_id=p_room and team<>actor.team and public.yut_node(route,step_index)=node2;
  end if;
  remaining:=coalesce(r.pending_moves[1:p_move_index-1],'{}')||coalesce(r.pending_moves[p_move_index+1:cardinality(r.pending_moves)],'{}');
  select count(*) into finished_count from yut_pieces where room_id=p_room and team=actor.team and public.yut_node(route,step_index)=99;
  if finished_count=4 then update yut_rooms set status='FINISHED',winner_team=actor.team,turn_seat=null,pending_moves='{}',can_roll=false,revision=revision+1,updated_at=now() where id=p_room; return; end if;
  if cardinality(remaining)>0 then update yut_rooms set pending_moves=remaining,can_roll=(can_roll or captured),revision=revision+1 where id=p_room;
  elsif captured or r.can_roll then update yut_rooms set pending_moves='{}',can_roll=true,revision=revision+1 where id=p_room;
  else nextseat:=(r.turn_seat+1)%r.max_players; update yut_rooms set turn_seat=nextseat,pending_moves='{}',can_roll=true,last_roll=null,revision=revision+1,updated_at=now() where id=p_room; end if;
end $$;

create or replace function public.yut_bot_tick(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; actor yut_players%rowtype; chosen_piece int; chosen_index int; idx int; mv int;
begin
  select * into r from yut_rooms where id=p_room for update;
  select * into actor from yut_players where room_id=p_room and seat=r.turn_seat;
  if not actor.is_bot then return; end if;
  if r.can_roll then perform public.yut_roll(p_room,true); return; end if;
  if cardinality(r.pending_moves)=0 then return; end if;
  for idx in 1..cardinality(r.pending_moves) loop
    mv:=r.pending_moves[idx];
    select p.piece_no,idx into chosen_piece,chosen_index from yut_pieces p
    where p.room_id=p_room and p.team=actor.team and public.yut_node(p.route,p.step_index)<>99
      and not(mv<0 and p.step_index=0 and not p.back_at_start)
    order by (case when mv<0 and p.step_index=0 and p.back_at_start then 20000 when public.yut_node(p.route,p.step_index+mv)=99 then 10000 else 0 end)+p.step_index desc limit 1;
    exit when chosen_piece is not null;
  end loop;
  if chosen_piece is null then update yut_rooms set pending_moves='{}',can_roll=true,turn_seat=(turn_seat+1)%max_players,revision=revision+1 where id=p_room;
  else perform public.yut_move(p_room,chosen_piece,chosen_index,true); end if;
end $$;

create or replace function public.yut_auto_act(p_room uuid,p_expected_revision bigint) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; actor yut_players%rowtype; chosen_piece int; chosen_index int; idx int; mv int;
begin
  select * into r from yut_rooms where id=p_room for update;
  if not found or r.status<>'PLAYING' or r.revision<>p_expected_revision then return; end if;
  select * into actor from yut_players where room_id=p_room and seat=r.turn_seat;
  if not found or actor.is_bot or actor.user_id<>auth.uid() then return; end if;
  if r.can_roll then perform public.yut_roll(p_room,false); return; end if;
  if cardinality(r.pending_moves)=0 then return; end if;
  for idx in 1..cardinality(r.pending_moves) loop
    mv:=r.pending_moves[idx];
    select p.piece_no,idx into chosen_piece,chosen_index from yut_pieces p
    where p.room_id=p_room and p.team=actor.team and public.yut_node(p.route,p.step_index)<>99
      and not(mv<0 and p.step_index=0 and not p.back_at_start)
    order by (case when mv<0 and p.step_index=0 and p.back_at_start then 20000 when public.yut_node(p.route,p.step_index+mv)=99 then 10000 else 0 end)+p.step_index desc limit 1;
    exit when chosen_piece is not null;
  end loop;
  if chosen_piece is null then update yut_rooms set pending_moves='{}',can_roll=true,turn_seat=(turn_seat+1)%max_players,revision=revision+1,updated_at=now() where id=p_room;
  else perform public.yut_move(p_room,chosen_piece,chosen_index,false); end if;
end $$;

revoke all on function public.yut_move(uuid,int,int,boolean),public.yut_move_choice(uuid,int,int,text,boolean),public.yut_bot_tick(uuid),public.yut_auto_act(uuid,bigint) from public,anon;
grant execute on function public.yut_move(uuid,int,int,boolean),public.yut_move_choice(uuid,int,int,text,boolean),public.yut_bot_tick(uuid),public.yut_auto_act(uuid,bigint) to authenticated;
