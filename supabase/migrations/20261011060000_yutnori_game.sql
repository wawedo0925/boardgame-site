begin;

create table public.yut_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  host_id uuid not null references auth.users(id),
  mode text not null check (mode in ('INDIVIDUAL','TEAM_2V2','TEAM_3X2')),
  status text not null default 'WAITING' check (status in ('WAITING','PLAYING','FINISHED')),
  max_players int not null,
  turn_seat int,
  pending_moves int[] not null default '{}',
  can_roll boolean not null default true,
  last_roll int,
  winner_team int,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.yut_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.yut_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  seat int not null,
  team int not null,
  name text not null,
  ready boolean not null default false,
  is_bot boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(room_id, seat),
  unique(room_id, user_id)
);

create table public.yut_pieces (
  room_id uuid not null references public.yut_rooms(id) on delete cascade,
  team int not null,
  piece_no int not null check(piece_no between 0 and 3),
  route text not null default 'outer' check(route in ('outer','diag1','diag2')),
  step_index int not null default 0,
  primary key(room_id, team, piece_no)
);

alter table public.yut_rooms enable row level security;
alter table public.yut_players enable row level security;
alter table public.yut_pieces enable row level security;
revoke all on public.yut_rooms, public.yut_players, public.yut_pieces from anon, authenticated;

create function public.yut_team_for_seat(p_mode text, p_seat int) returns int
language sql immutable as $$
  select case when p_mode='INDIVIDUAL' then p_seat when p_mode='TEAM_2V2' then p_seat%2 else p_seat%3 end
$$;

create function public.yut_node(p_route text, p_step int) returns int
language plpgsql immutable as $$
declare path int[];
begin
  if p_step<=0 then return 0; end if;
  if p_route='diag1' then path:=array[0,1,2,3,4,5,21,22,23,24,15,16,17,18,19,20,99];
  elsif p_route='diag2' then path:=array[0,1,2,3,4,5,6,7,8,9,10,25,26,22,27,28,20,99];
  else path:=array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,99]; end if;
  if p_step+1>cardinality(path) then return 99; end if;
  return path[p_step+1];
end $$;

create function public.yut_create_room(p_title text default null, p_mode text default 'INDIVIDUAL', p_max_players int default 4) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid; c text; mode text:=upper(coalesce(p_mode,'INDIVIDUAL')); n int; member_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if mode not in ('INDIVIDUAL','TEAM_2V2','TEAM_3X2') then raise exception '게임 방식을 확인해 주세요.'; end if;
  n:=case when mode='INDIVIDUAL' then greatest(2,least(4,p_max_players)) when mode='TEAM_3X2' then 6 else 4 end;
  select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from profiles where id=auth.uid();
  loop c:=upper(substr(md5(random()::text),1,6)); exit when not exists(select 1 from yut_rooms where code=c); end loop;
  insert into yut_rooms(code,title,host_id,mode,max_players) values(c,left(coalesce(nullif(trim(p_title),''),member_name||' 윷놀이'),30),auth.uid(),mode,n) returning id into rid;
  insert into yut_players(room_id,user_id,seat,team,name) values(rid,auth.uid(),0,public.yut_team_for_seat(mode,0),member_name);
  return rid;
end $$;

create function public.yut_join_room(p_room uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; s int; member_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into r from yut_rooms where id=p_room for update;
  if not found or r.status<>'WAITING' then raise exception '참여할 수 없는 방입니다.'; end if;
  if exists(select 1 from yut_players where room_id=p_room and user_id=auth.uid()) then return p_room; end if;
  select x into s from generate_series(0,r.max_players-1)x where not exists(select 1 from yut_players where room_id=p_room and seat=x) order by x limit 1;
  if s is null then raise exception '방이 가득 찼습니다.'; end if;
  select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from profiles where id=auth.uid();
  insert into yut_players(room_id,user_id,seat,team,name) values(p_room,auth.uid(),s,public.yut_team_for_seat(r.mode,s),member_name);
  update yut_rooms set revision=revision+1,updated_at=now() where id=p_room; return p_room;
end $$;

create function public.yut_add_bot(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; s int; names text[]:=array['윷돌이','달토끼','까치','도깨비','해님','바람이']; bot_name text;
begin
  select * into r from yut_rooms where id=p_room for update;
  if r.host_id<>auth.uid() or r.status<>'WAITING' then raise exception '대기 중인 방의 방장만 AI를 추가할 수 있습니다.'; end if;
  select x into s from generate_series(0,r.max_players-1)x where not exists(select 1 from yut_players where room_id=p_room and seat=x) order by x limit 1;
  if s is null then raise exception '빈자리가 없습니다.'; end if;
  bot_name:=names[(s%cardinality(names))+1];
  insert into yut_players(room_id,seat,team,name,ready,is_bot) values(p_room,s,public.yut_team_for_seat(r.mode,s),bot_name,true,true);
  update yut_rooms set revision=revision+1,updated_at=now() where id=p_room;
end $$;

create function public.yut_remove_bot(p_room uuid,p_player uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from yut_rooms where id=p_room and host_id=auth.uid() and status='WAITING') then raise exception '방장만 AI를 내보낼 수 있습니다.'; end if;
  delete from yut_players where room_id=p_room and id=p_player and is_bot;
  update yut_rooms set revision=revision+1 where id=p_room;
end $$;

create function public.yut_toggle_ready(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update yut_players set ready=not ready where room_id=p_room and user_id=auth.uid() and not is_bot;
  if not found then raise exception '참가자가 아닙니다.'; end if;
  update yut_rooms set revision=revision+1 where id=p_room and status='WAITING';
end $$;

create function public.yut_leave_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare h uuid; st text;
begin
  select host_id,status into h,st from yut_rooms where id=p_room for update;
  if st<>'WAITING' then raise exception '게임이 시작된 뒤에는 나갈 수 없습니다.'; end if;
  if h=auth.uid() then delete from yut_rooms where id=p_room; else delete from yut_players where room_id=p_room and user_id=auth.uid(); update yut_rooms set revision=revision+1 where id=p_room; end if;
end $$;

create function public.yut_start_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; teams int;
begin
  select * into r from yut_rooms where id=p_room for update;
  if r.host_id<>auth.uid() or r.status<>'WAITING' then raise exception '방장만 시작할 수 있습니다.'; end if;
  if (select count(*) from yut_players where room_id=p_room)<>r.max_players then raise exception '모든 자리를 채워 주세요.'; end if;
  if exists(select 1 from yut_players where room_id=p_room and not ready and user_id<>r.host_id) then raise exception '모두 준비해야 합니다.'; end if;
  teams:=case when r.mode='INDIVIDUAL' then r.max_players when r.mode='TEAM_2V2' then 2 else 3 end;
  delete from yut_pieces where room_id=p_room;
  insert into yut_pieces(room_id,team,piece_no) select p_room,t,p from generate_series(0,teams-1)t cross join generate_series(0,3)p;
  update yut_rooms set status='PLAYING',turn_seat=0,pending_moves='{}',can_roll=true,last_roll=null,winner_team=null,revision=revision+1,updated_at=now() where id=p_room;
end $$;

create function public.yut_roll(p_room uuid, p_bot boolean default false) returns int
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; p yut_players%rowtype; sticks int; result int;
begin
  select * into r from yut_rooms where id=p_room for update;
  select * into p from yut_players where room_id=p_room and seat=r.turn_seat;
  if r.status<>'PLAYING' or not r.can_roll then raise exception '지금은 윷을 던질 수 없습니다.'; end if;
  if (not p_bot and p.user_id<>auth.uid()) or (p_bot and not p.is_bot) then raise exception '지금은 내 차례가 아닙니다.'; end if;
  sticks:=floor(random()*16)::int;
  result:=case when sticks=0 then -1 when sticks<=3 then 1 when sticks<=9 then 2 when sticks<=13 then 3 when sticks=14 then 4 else 5 end;
  if result=-1 and not exists(select 1 from yut_pieces y where y.room_id=p_room and y.team=p.team and public.yut_node(y.route,y.step_index) not in (0,99)) then
    if cardinality(r.pending_moves)=0 then
      update yut_rooms set turn_seat=(turn_seat+1)%max_players,can_roll=true,last_roll=result,revision=revision+1,updated_at=now() where id=p_room;
    else
      update yut_rooms set can_roll=false,last_roll=result,revision=revision+1,updated_at=now() where id=p_room;
    end if;
  else
    update yut_rooms set pending_moves=array_append(pending_moves,result),can_roll=(result in (4,5)),last_roll=result,revision=revision+1,updated_at=now() where id=p_room;
  end if;
  return result;
end $$;

create function public.yut_move(p_room uuid,p_piece int,p_move_index int,p_bot boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare r yut_rooms%rowtype; actor yut_players%rowtype; pc yut_pieces%rowtype; mv int; route2 text; step2 int; node0 int; node2 int; stack_count int; captured boolean:=false; finished_count int; nextseat int; remaining int[];
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
  if node2=99 then step2:=case when route2='diag1' then 16 when route2='diag2' then 17 else 21 end; end if;
  if node0=0 then
    update yut_pieces set route=route2,step_index=step2 where room_id=p_room and team=actor.team and piece_no=p_piece;
  else
    update yut_pieces set route=route2,step_index=step2 where room_id=p_room and team=actor.team and public.yut_node(route,step_index)=node0;
  end if;
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

create function public.yut_bot_tick(p_room uuid) returns void
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
    select p.piece_no,idx
    into chosen_piece,chosen_index from yut_pieces p
    where p.room_id=p_room and p.team=actor.team and public.yut_node(p.route,p.step_index)<>99 and not(mv<0 and p.step_index=0)
    order by
      (case when public.yut_node(p.route,p.step_index+mv)=99 then 10000 else 0 end)+
      (case when exists(select 1 from yut_pieces o where o.room_id=p_room and o.team<>actor.team and public.yut_node(o.route,o.step_index)=public.yut_node(p.route,p.step_index+mv)) then 1000 else 0 end)+
      (case when public.yut_node(p.route,p.step_index) in (5,10) then 200 else 0 end)+p.step_index desc limit 1;
    exit when chosen_piece is not null;
  end loop;
  if chosen_piece is null then
    update yut_rooms set pending_moves='{}',can_roll=true,turn_seat=(turn_seat+1)%max_players,revision=revision+1 where id=p_room;
  else perform public.yut_move(p_room,chosen_piece,chosen_index,true); end if;
end $$;

create function public.yut_snapshot(p_room uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'room',to_jsonb(r),
    'me',coalesce((select jsonb_build_object('id',p.id,'seat',p.seat,'team',p.team,'ready',p.ready) from yut_players p where p.room_id=r.id and p.user_id=auth.uid()),'null'::jsonb),
    'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.seat) from yut_players p where p.room_id=r.id),'[]'::jsonb),
    'pieces',coalesce((select jsonb_agg(to_jsonb(y) order by y.team,y.piece_no) from yut_pieces y where y.room_id=r.id),'[]'::jsonb)
  ) from yut_rooms r where r.id=p_room and exists(select 1 from yut_players p where p.room_id=r.id and p.user_id=auth.uid())
$$;

create function public.yut_lobby() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'title',r.title,'mode',r.mode,'status',r.status,'players',(select count(*) from yut_players p where p.room_id=r.id),'max_players',r.max_players,'mine',exists(select 1 from yut_players p where p.room_id=r.id and p.user_id=auth.uid())) order by r.created_at desc),'[]'::jsonb)
  from yut_rooms r where r.status='WAITING' or exists(select 1 from yut_players p where p.room_id=r.id and p.user_id=auth.uid())
$$;

revoke all on function public.yut_team_for_seat(text,int),public.yut_node(text,int),public.yut_create_room(text,text,int),public.yut_join_room(uuid),public.yut_add_bot(uuid),public.yut_remove_bot(uuid,uuid),public.yut_toggle_ready(uuid),public.yut_leave_room(uuid),public.yut_start_room(uuid),public.yut_roll(uuid,boolean),public.yut_move(uuid,int,int,boolean),public.yut_bot_tick(uuid),public.yut_snapshot(uuid),public.yut_lobby() from public,anon;
grant execute on function public.yut_create_room(text,text,int),public.yut_join_room(uuid),public.yut_add_bot(uuid),public.yut_remove_bot(uuid,uuid),public.yut_toggle_ready(uuid),public.yut_leave_room(uuid),public.yut_start_room(uuid),public.yut_roll(uuid,boolean),public.yut_move(uuid,int,int,boolean),public.yut_bot_tick(uuid),public.yut_snapshot(uuid),public.yut_lobby() to authenticated;

commit;
