begin;

create table public.quoridor_rooms (
 id uuid primary key default gen_random_uuid(),
 code text unique not null,
 host_id uuid not null references auth.users(id),
 guest_id uuid references auth.users(id),
 host_name text not null, guest_name text,
 status text not null default 'WAITING' check(status in ('WAITING','PLAYING','FINISHED')),
 positions jsonb not null default '[76,4]',
 walls jsonb not null default '[]',
 remaining int[] not null default array[10,10],
 turn int not null default 0, winner int,
 revision int not null default 0,
 last_action text not null default '상대를 기다리고 있어요',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.quoridor_rooms enable row level security;
revoke all on public.quoridor_rooms from anon,authenticated;

-- Coordinates: row/column 0..8, walls at intersections 0..7.
create function public.qr_open(a int,b int,walls jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare w jsonb; ar int:=a/9; ac int:=a%9; br int:=b/9; bc int:=b%9;
begin
 if a<0 or a>80 or b<0 or b>80 or abs(ar-br)+abs(ac-bc)<>1 then return false; end if;
 for w in select value from jsonb_array_elements(walls) loop
  if w->>'o'='h' and ar<>br and least(ar,br)=(w->>'r')::int and ac between (w->>'c')::int and (w->>'c')::int+1 then return false; end if;
  if w->>'o'='v' and ac<>bc and least(ac,bc)=(w->>'c')::int and ar between (w->>'r')::int and (w->>'r')::int+1 then return false; end if;
 end loop;
 return true;
end $$;

create function public.qr_path(start_pos int,goal_row int,walls jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare queue int[]:=array[start_pos]; seen int[]:=array[start_pos]; i int:=1; n int; next_pos int;
begin
 while i<=cardinality(queue) loop
  n:=queue[i]; i:=i+1;
  if n/9=goal_row then return true; end if;
  foreach next_pos in array array[n-9,n+9,n-1,n+1] loop
   if not next_pos=any(seen) and qr_open(n,next_pos,walls) then
    seen:=array_append(seen,next_pos); queue:=array_append(queue,next_pos);
   end if;
  end loop;
 end loop;
 return false;
end $$;

create function public.qr_moves(pos int,opponent int,walls jsonb) returns int[]
language plpgsql immutable set search_path=public as $$
declare n int; landing int; side int; result int[]:='{}';
begin
 foreach n in array array[pos-9,pos+9,pos-1,pos+1] loop
  if not qr_open(pos,n,walls) then continue; end if;
  if n<>opponent then result:=array_append(result,n); continue; end if;
  landing:=n+(n-pos);
  if qr_open(n,landing,walls) then result:=array_append(result,landing);
  else
   foreach side in array case when abs(n-pos)=9 then array[n-1,n+1] else array[n-9,n+9] end loop
    if qr_open(n,side,walls) then result:=array_append(result,side); end if;
   end loop;
  end if;
 end loop;
 return result;
end $$;

create function public.qr_wall_valid(walls jsonb,positions jsonb,r int,c int,o text) returns boolean
language plpgsql immutable set search_path=public as $$
declare w jsonb; next_walls jsonb;
begin
 if r is null or c is null or o is null or r not between 0 and 7 or c not between 0 and 7 or o not in ('h','v') then return false; end if;
 for w in select value from jsonb_array_elements(walls) loop
  if (w->>'r')::int=r and (w->>'c')::int=c then return false; end if;
  if w->>'o'=o and ((o='h' and (w->>'r')::int=r and abs((w->>'c')::int-c)<2)
   or (o='v' and (w->>'c')::int=c and abs((w->>'r')::int-r)<2)) then return false; end if;
 end loop;
 next_walls:=walls||jsonb_build_array(jsonb_build_object('r',r,'c',c,'o',o));
 return qr_path((positions->>0)::int,0,next_walls) and qr_path((positions->>1)::int,8,next_walls);
end $$;

create function public.quoridor_lobby() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 return coalesce((select jsonb_agg(x order by x.updated_at desc) from
  (select id,code,host_name,guest_name,status,updated_at,(auth.uid() in (host_id,guest_id)) as mine
   from quoridor_rooms where (status='WAITING' and updated_at>now()-interval '1 day') or auth.uid() in (host_id,guest_id)
   order by updated_at desc limit 50) x),'[]');
end $$;

create function public.quoridor_create() returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid; username text;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select id into rid from quoridor_rooms where auth.uid() in (host_id,guest_id) and status<>'FINISHED' limit 1;
 if found then return rid; end if;
 select coalesce(nullif(trim(activity_name),''),'멤버') into username from profiles where id=auth.uid();
 insert into quoridor_rooms(code,host_id,host_name) values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),auth.uid(),coalesce(username,'멤버')) returning id into rid;
 return rid;
end $$;

create function public.quoridor_join(p_code text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r quoridor_rooms%rowtype; username text;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select * into r from quoridor_rooms where code=upper(trim(p_code)) for update;
 if not found then raise exception '방 코드를 확인해 주세요.'; end if;
 if auth.uid() in (r.host_id,r.guest_id) then return r.id; end if;
 if r.status<>'WAITING' or r.guest_id is not null then raise exception '참여할 수 없는 방입니다.'; end if;
 if exists(select 1 from quoridor_rooms where auth.uid() in (host_id,guest_id) and status<>'FINISHED') then raise exception '참여 중인 방에서 먼저 나와 주세요.'; end if;
 select coalesce(nullif(trim(activity_name),''),'멤버') into username from profiles where id=auth.uid();
 update quoridor_rooms set guest_id=auth.uid(),guest_name=coalesce(username,'멤버'),revision=revision+1,updated_at=now(),last_action='두 명이 모였어요. 방장이 시작해 주세요.' where id=r.id;
 return r.id;
end $$;

create function public.quoridor_snapshot(p_room uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r quoridor_rooms%rowtype; seat int;
begin
 select * into r from quoridor_rooms where id=p_room;
 if auth.uid() is null or not found or (auth.uid()<>r.host_id and auth.uid() is distinct from r.guest_id) then raise exception '참여 중인 방이 아닙니다.'; end if;
 seat:=case when auth.uid()=r.host_id then 0 else 1 end;
 return to_jsonb(r)||jsonb_build_object('seat',seat,'moves',qr_moves((r.positions->>seat)::int,(r.positions->>(1-seat))::int,r.walls));
end $$;

create function public.quoridor_action(p_room uuid,p_revision int,p_action text,p_payload jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r quoridor_rooms%rowtype; seat int; target int; wr int; wc int; wo text; next_pos jsonb; winner_seat int; label text;
begin
 select * into r from quoridor_rooms where id=p_room for update;
 if auth.uid() is null or not found or (auth.uid()<>r.host_id and auth.uid() is distinct from r.guest_id) then raise exception '참가자가 아닙니다.'; end if;
 if p_revision is distinct from r.revision then raise exception '화면이 갱신되었어요. 다시 선택해 주세요.'; end if;
 seat:=case when auth.uid()=r.host_id then 0 else 1 end;
 if p_action='leave' then
  if r.status='WAITING' then
   if seat=0 then delete from quoridor_rooms where id=p_room;
   else update quoridor_rooms set guest_id=null,guest_name=null,revision=revision+1,updated_at=now(),last_action='상대를 기다리고 있어요' where id=p_room; end if;
  elsif r.status='PLAYING' then
   update quoridor_rooms set status='FINISHED',winner=1-seat,last_action='상대의 기권으로 경기가 끝났어요',revision=revision+1,updated_at=now() where id=p_room;
  end if;
  return;
 end if;
 if p_action='start' then
  if seat<>0 or r.status<>'WAITING' or r.guest_id is null then raise exception '두 명이 입장하면 방장이 시작할 수 있어요.'; end if;
  update quoridor_rooms set status='PLAYING',turn=floor(random()*2)::int,revision=revision+1,updated_at=now(),last_action='경기 시작! 반대편 끝줄에 먼저 도착하세요.' where id=p_room; return;
 end if;
 if r.status<>'PLAYING' or seat<>r.turn then raise exception '내 차례에 선택해 주세요.'; end if;
 label:=case when seat=0 then r.host_name else r.guest_name end;
 if p_action='move' then
  target:=(p_payload->>'target')::int;
  if target is null or not target=any(qr_moves((r.positions->>seat)::int,(r.positions->>(1-seat))::int,r.walls)) then raise exception '이동할 수 없는 칸입니다.'; end if;
  next_pos:=jsonb_set(r.positions,array[seat::text],to_jsonb(target));
  if target/9=(case when seat=0 then 0 else 8 end) then winner_seat:=seat; end if;
  update quoridor_rooms set positions=next_pos,winner=winner_seat,status=case when winner_seat is null then 'PLAYING' else 'FINISHED' end,
   turn=1-seat,revision=revision+1,updated_at=now(),last_action=label||case when winner_seat is null then '님이 이동했어요' else '님이 도착했어요. 승리!' end where id=p_room;
 elsif p_action='wall' then
  wr:=(p_payload->>'r')::int; wc:=(p_payload->>'c')::int; wo:=p_payload->>'o';
  if r.remaining[seat+1]<=0 then raise exception '남은 벽이 없어요.'; end if;
  if not qr_wall_valid(r.walls,r.positions,wr,wc,wo) then raise exception '벽이 겹치거나 도착할 길을 막고 있어요. 다른 위치를 골라 주세요.'; end if;
  r.remaining[seat+1]:=r.remaining[seat+1]-1;
  update quoridor_rooms set walls=walls||jsonb_build_array(jsonb_build_object('r',wr,'c',wc,'o',wo,'seat',seat)),remaining=r.remaining,
   turn=1-seat,revision=revision+1,updated_at=now(),last_action=label||'님이 벽을 설치했어요' where id=p_room;
 else raise exception '잘못된 요청입니다.';
 end if;
end $$;

revoke all on function public.qr_open(int,int,jsonb),public.qr_path(int,int,jsonb),public.qr_moves(int,int,jsonb),public.qr_wall_valid(jsonb,jsonb,int,int,text) from public;
revoke all on function public.quoridor_create(),public.quoridor_join(text),public.quoridor_lobby(),public.quoridor_snapshot(uuid),public.quoridor_action(uuid,int,text,jsonb) from public;
grant execute on function public.quoridor_create(),public.quoridor_join(text),public.quoridor_lobby(),public.quoridor_snapshot(uuid),public.quoridor_action(uuid,int,text,jsonb) to authenticated;
commit;
