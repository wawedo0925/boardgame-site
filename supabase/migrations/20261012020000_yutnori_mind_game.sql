begin;
alter table yut_rooms add column mind_game boolean not null default false,
 add column mind_round bigint not null default 0, add column mind_reveal jsonb;
create table yut_mind_choices(
 room_id uuid references yut_rooms on delete cascade,
 player_id uuid references yut_players on delete cascade,
 round bigint not null, fronts int not null check(fronts between 0 and 2),
 primary key(room_id,player_id)
);
alter table yut_mind_choices enable row level security;
revoke all on yut_mind_choices from public,anon,authenticated;

alter function yut_create_room(text,text,int) rename to yut_create_room_before_mind;
revoke all on function yut_create_room_before_mind(text,text,int) from public,anon,authenticated;
create function yut_create_room(p_title text default null,p_mode text default 'INDIVIDUAL',p_max_players int default 4) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 rid:=yut_create_room_before_mind(p_title,case when p_mode='PSYCHOLOGY' then 'INDIVIDUAL' else p_mode end,case when p_mode='PSYCHOLOGY' then 2 else p_max_players end);
 if p_mode='PSYCHOLOGY' then update yut_rooms set mind_game=true where id=rid;end if;
 return rid;
end $$;

create function yut_mind_reset() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status<>old.status then
  delete from yut_mind_choices where room_id=new.id;
  new.mind_round:=old.mind_round+1;new.mind_reveal:=null;
 end if;
 return new;
end $$;
create trigger yut_mind_reset before update on yut_rooms for each row execute function yut_mind_reset();

create function yut_mind_choose(p_room uuid,p_round bigint,p_fronts int) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms; me yut_players; actor yut_players; total int; result int; reveal jsonb;
begin
 select * into r from yut_rooms where id=p_room for update;
 select * into me from yut_players where room_id=p_room and user_id=auth.uid();
 if me.id is null or not r.mind_game or r.status<>'PLAYING' or not r.can_roll then raise exception '지금은 비밀 선택을 할 수 없습니다.';end if;
 if p_round is null or p_round<>r.mind_round then raise exception '이미 결과가 적용되었습니다. 화면을 새로 확인해 주세요.';end if;
 if p_fronts is null or p_fronts not between 0 and 2 then raise exception '윷 두 개를 선택해 주세요.';end if;
 if exists(select 1 from yut_mind_choices where room_id=p_room and player_id=me.id) then return;end if;
 insert into yut_mind_choices values(p_room,me.id,p_round,p_fronts);
 -- AI chooses independently; it never reads the human choice.
 insert into yut_mind_choices select p_room,id,p_round,floor(random()*3)::int from yut_players where room_id=p_room and is_bot on conflict do nothing;
 if (select count(*) from yut_mind_choices where room_id=p_room)<>2 then
  update yut_rooms set revision=revision+1 where id=p_room;return;
 end if;
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

-- Guard all old roll/timeout and movement entry points on the server too.
do $$
declare fn text; signature regprocedure;
begin
 foreach signature in array array['yut_roll(uuid,boolean)'::regprocedure,'yut_bot_tick(uuid)'::regprocedure,'yut_auto_act(uuid,bigint)'::regprocedure,'yut_move(uuid,integer,integer,boolean)'::regprocedure,'yut_move_choice(uuid,integer,integer,text,boolean)'::regprocedure] loop
  fn:=pg_get_functiondef(signature);
  fn:=regexp_replace(fn,'\mbegin\s+', E'begin\n if exists(select 1 from yut_rooms where id=p_room and mind_game and can_roll) then return'||case when signature='yut_roll(uuid,boolean)'::regprocedure then ' null' else '' end||E'; end if;\n','i');
  execute fn;
 end loop;
end $$;

alter function yut_snapshot(uuid) rename to yut_snapshot_before_mind;
revoke all on function yut_snapshot_before_mind(uuid) from public,anon,authenticated;
create function yut_snapshot(p_room uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s jsonb; r yut_rooms;
begin
 s:=yut_snapshot_before_mind(p_room);if s is null then return s;end if;
 select * into r from yut_rooms where id=p_room;
 if r.mind_game then
  s:=jsonb_set(s,'{room,mode}','"PSYCHOLOGY"');
  s:=jsonb_set(s,'{room}',s->'room'||jsonb_build_object(
   'mind_selected',coalesce((select jsonb_agg(player_id) from yut_mind_choices where room_id=p_room),'[]'),
   'mind_my_choice',(select c.fronts from yut_mind_choices c join yut_players p on p.id=c.player_id where c.room_id=p_room and p.user_id=auth.uid())));
 end if;
 return s;
end $$;
alter function yut_lobby() rename to yut_lobby_before_mind;
revoke all on function yut_lobby_before_mind() from public,anon,authenticated;
create function yut_lobby() returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(case when r.mind_game then jsonb_set(x,'{mode}','"PSYCHOLOGY"') else x end),'[]') from jsonb_array_elements(yut_lobby_before_mind()) x join yut_rooms r on r.id=(x->>'id')::uuid;
$$;
revoke all on function yut_mind_choose(uuid,bigint,int),yut_mind_reset(),yut_create_room(text,text,int),yut_snapshot(uuid),yut_lobby() from public,anon;
grant execute on function yut_mind_choose(uuid,bigint,int),yut_create_room(text,text,int),yut_snapshot(uuid),yut_lobby() to authenticated;
commit;
