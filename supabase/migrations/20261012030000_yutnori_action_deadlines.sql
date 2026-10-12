begin;
alter table yut_rooms add column action_deadline timestamptz;
create function yut_action_deadline() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status<>'PLAYING' then new.action_deadline:=null;
 elsif old.status is distinct from new.status or old.turn_seat is distinct from new.turn_seat
 or old.can_roll is distinct from new.can_roll or old.pending_moves is distinct from new.pending_moves
 or old.mind_round is distinct from new.mind_round or new.action_deadline is null then
 new.action_deadline:=clock_timestamp()+make_interval(secs=>case when new.can_roll and not new.mind_game then 5 else 15 end);
 end if;
 return new;
end $$;
create trigger zz_yut_action_deadline before update on yut_rooms for each row execute function yut_action_deadline();
update yut_rooms set action_deadline=null where status='PLAYING';

create function yut_mind_resolve(p_room uuid) returns void language plpgsql security definer set search_path=public as $$
declare r yut_rooms; actor yut_players; total int; result int; reveal jsonb;
begin
 select * into r from yut_rooms where id=p_room for update;
 if not r.mind_game or r.status<>'PLAYING' or not r.can_roll or (select count(*) from yut_mind_choices where room_id=p_room)<>2 then return;end if;
 select sum(fronts),jsonb_agg(jsonb_build_object('player_id',player_id,'fronts',fronts) order by player_id) into total,reveal from yut_mind_choices where room_id=p_room;
 result:=case total when 0 then 5 when 1 then -1 else total end;
 select * into actor from yut_players where room_id=p_room and seat=r.turn_seat;
 delete from yut_mind_choices where room_id=p_room;
 update yut_rooms set mind_round=mind_round+1,mind_reveal=reveal where id=p_room;
 if result=-1 and not exists(select 1 from yut_pieces y where y.room_id=p_room and y.team=actor.team and yut_node(y.route,y.step_index)<>99 and (y.step_index>0 or y.back_at_start)) then
  update yut_rooms set turn_seat=case when cardinality(pending_moves)=0 then (turn_seat+1)%max_players else turn_seat end,
   can_roll=(cardinality(pending_moves)=0),last_roll=result,revision=revision+1,updated_at=now() where id=p_room;
 else
  update yut_rooms set pending_moves=array_append(pending_moves,result),can_roll=result in (4,5),last_roll=result,revision=revision+1,updated_at=now() where id=p_room;
 end if;
end $$;
revoke all on function yut_mind_resolve(uuid),yut_action_deadline() from public,anon,authenticated;

-- Keep the normal authenticated selection validation and share result resolution.
do $$
declare fn text;
begin
 fn:=pg_get_functiondef('yut_mind_choose(uuid,bigint,integer)'::regprocedure);
 fn:=substring(fn from 1 for position(' select sum(fronts)' in fn)-1)||E' perform yut_mind_resolve(p_room);\nend $function$;';
 execute fn;
end $$;

create function yut_mind_timeout(p_room uuid,p_round bigint) returns void language plpgsql security definer set search_path=public as $$
declare r yut_rooms;
begin
 select * into r from yut_rooms where id=p_room for update;
 if not exists(select 1 from yut_players where room_id=p_room and user_id=auth.uid()) then raise exception '참가자만 진행할 수 있습니다.';end if;
 if r.status<>'PLAYING' or not r.mind_game or not r.can_roll or p_round is null or r.mind_round<>p_round
 or r.action_deadline is null or clock_timestamp()<r.action_deadline then return;end if;
 insert into yut_mind_choices select p_room,id,r.mind_round,floor(random()*3)::int from yut_players where room_id=p_room on conflict do nothing;
 perform yut_mind_resolve(p_room);
end $$;
revoke all on function yut_mind_timeout(uuid,bigint) from public,anon;
grant execute on function yut_mind_timeout(uuid,bigint) to authenticated;

-- At the center the right-hand diagonal has only four steps left to finish.
do $$
declare fn text; sig regprocedure;
begin
 foreach sig in array array['yut_auto_act(uuid,bigint)'::regprocedure,'yut_bot_tick(uuid)'::regprocedure] loop
 fn:=pg_get_functiondef(sig);
 fn:=replace(fn,'else perform public.yut_move(p_room,chosen_piece,chosen_index,',
 E'elsif r.pending_moves[chosen_index]>0 and exists(select 1 from yut_pieces where room_id=p_room and team=actor.team and piece_no=chosen_piece and yut_node(route,step_index)=22) then perform public.yut_move_choice(p_room,chosen_piece,chosen_index,''RIGHT'','||case when sig='yut_bot_tick(uuid)'::regprocedure then 'true' else 'false' end||E');\n  else perform public.yut_move(p_room,chosen_piece,chosen_index,');
 execute fn;
 end loop;
end $$;
alter function yut_auto_act(uuid,bigint) rename to yut_auto_act_before_deadline;
revoke all on function yut_auto_act_before_deadline(uuid,bigint) from public,anon,authenticated;
create function yut_auto_act(p_room uuid,p_expected_revision bigint) returns void language plpgsql security definer set search_path=public as $$
declare r yut_rooms;
begin
 select * into r from yut_rooms where id=p_room for update;
 if r.action_deadline is null or clock_timestamp()<r.action_deadline then return;end if;
 perform yut_auto_act_before_deadline(p_room,p_expected_revision);
end $$;
revoke all on function yut_auto_act(uuid,bigint) from public,anon;
grant execute on function yut_auto_act(uuid,bigint) to authenticated;
commit;
