begin;
alter table public.quoridor_rooms add column capacity int not null default 2 check(capacity in (2,4)),
 add column player_ids uuid[], add column names text[];
update public.quoridor_rooms set player_ids=array[host_id,guest_id],names=array[host_name,guest_name];
alter table public.quoridor_rooms alter column player_ids set not null,alter column names set not null;

create function public.qr_goal(pos int,seat int) returns boolean language sql immutable set search_path=public as $$
 select (case when seat<2 then pos/9 else pos%9 end)=(case when seat in (0,3) then 0 else 8 end) $$;
create function public.qr_moves_multi(pos int,positions jsonb,seat int,walls jsonb) returns int[]
language plpgsql immutable set search_path=public as $$
declare n int; landing int; side int; occupied int[]; result int[]:='{}';
begin
 select array_agg(value::int) into occupied from jsonb_array_elements_text(positions) with ordinality as t(value,i) where i<>seat+1;
 foreach n in array array[pos-9,pos+9,pos-1,pos+1] loop
  if not qr_open(pos,n,walls) then continue; end if;
  if not n=any(occupied) then result:=array_append(result,n); continue; end if;
  landing:=n+n-pos;
  if qr_open(n,landing,walls) and not landing=any(occupied) then result:=array_append(result,landing);
  else foreach side in array case when abs(n-pos)=9 then array[n-1,n+1] else array[n-9,n+9] end loop
   if qr_open(n,side,walls) and not side=any(occupied) then result:=array_append(result,side); end if;
  end loop; end if;
 end loop;
 return array(select v from unnest(result) with ordinality as t(v,i) group by v order by min(i));
end $$;
create function public.qr_path_seat(start_pos int,seat int,walls jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare queue int[]:=array[start_pos]; seen int[]:=array[start_pos]; i int:=1; n int; np int;
begin
 while i<=cardinality(queue) loop
 n:=queue[i];i:=i+1;
 if qr_goal(n,seat) then return true; end if;
 foreach np in array array[n-9,n+9,n-1,n+1] loop
 if not np=any(seen) and qr_open(n,np,walls) then seen:=array_append(seen,np);queue:=array_append(queue,np);end if;
 end loop;end loop;return false;
end $$;
create or replace function public.qr_wall_valid(walls jsonb,positions jsonb,r int,c int,o text) returns boolean
language plpgsql immutable set search_path=public as $$
declare w jsonb; next_walls jsonb; seat int;
begin
 if r is null or c is null or o is null or r not between 0 and 7 or c not between 0 and 7 or o not in ('h','v') then return false; end if;
 for w in select value from jsonb_array_elements(walls) loop
  if (w->>'r')::int=r and (w->>'c')::int=c then return false; end if;
  if w->>'o'=o and ((o='h' and (w->>'r')::int=r and abs((w->>'c')::int-c)<2)
   or (o='v' and (w->>'c')::int=c and abs((w->>'r')::int-r)<2)) then return false; end if;
 end loop;
 next_walls:=walls||jsonb_build_array(jsonb_build_object('r',r,'c',c,'o',o));
 for seat in 0..jsonb_array_length(positions)-1 loop
  if not qr_path_seat((positions->>seat)::int,seat,next_walls) then return false; end if;
 end loop;return true;
end $$;

create or replace function public.quoridor_lobby() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 return coalesce((select jsonb_agg(x order by x.updated_at desc) from
 (select id,code,host_name,guest_name,status,capacity,names,updated_at,coalesce(auth.uid()=any(player_ids),false) as mine
 from quoridor_rooms where (status='WAITING' and updated_at>now()-interval '1 day') or auth.uid()=any(player_ids)
 order by updated_at desc limit 50) x),'[]');
end $$;
create function public.quoridor_create(p_capacity int) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid; username text; ids uuid[]; labels text[];
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if p_capacity is null or p_capacity not in (2,4) then raise exception '2인 또는 4인을 선택해 주세요.'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select id into rid from quoridor_rooms where auth.uid()=any(player_ids) and status<>'FINISHED' limit 1;
 if found then return rid; end if;
 select coalesce(nullif(trim(activity_name),''),'멤버') into username from profiles where id=auth.uid();
 ids:=array_fill(null::uuid,array[p_capacity]);ids[1]:=auth.uid();
 labels:=array_fill(null::text,array[p_capacity]);labels[1]:=coalesce(username,'멤버');
 insert into quoridor_rooms(code,host_id,host_name,capacity,player_ids,names,positions,remaining)
 values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),auth.uid(),labels[1],p_capacity,ids,labels,
 case when p_capacity=4 then '[76,4,36,44]'::jsonb else '[76,4]'::jsonb end,array_fill(case when p_capacity=4 then 5 else 10 end,array[p_capacity])) returning id into rid;
 return rid;
end $$;
create or replace function public.quoridor_create() returns uuid language sql security definer set search_path=public as $$select quoridor_create(2)$$;
create or replace function public.quoridor_join(p_code text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r quoridor_rooms%rowtype; username text; slot int;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select * into r from quoridor_rooms where code=upper(trim(p_code)) for update;
 if not found then raise exception '방 코드를 확인해 주세요.'; end if;
 if auth.uid()=any(r.player_ids) then return r.id; end if;
 slot:=array_position(r.player_ids,null);
 if r.status<>'WAITING' or slot is null then raise exception '참여할 수 없는 방입니다.'; end if;
 if exists(select 1 from quoridor_rooms where auth.uid()=any(player_ids) and status<>'FINISHED') then raise exception '참여 중인 방에서 먼저 나와 주세요.'; end if;
 select coalesce(nullif(trim(activity_name),''),'멤버') into username from profiles where id=auth.uid();
 r.player_ids[slot]:=auth.uid();r.names[slot]:=coalesce(username,'멤버');
 update quoridor_rooms set player_ids=r.player_ids,names=r.names,guest_id=r.player_ids[2],guest_name=r.names[2],revision=revision+1,updated_at=now(),last_action='참가자가 입장했어요.' where id=r.id;
 return r.id;
end $$;
create or replace function public.quoridor_snapshot(p_room uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r quoridor_rooms%rowtype; seat int;
begin
 select * into r from quoridor_rooms where id=p_room;
 seat:=array_position(r.player_ids,auth.uid())-1;
 if auth.uid() is null or seat is null then raise exception '참여 중인 방이 아닙니다.'; end if;
 return to_jsonb(r)||jsonb_build_object('seat',seat,'moves',qr_moves_multi((r.positions->>seat)::int,r.positions,seat,r.walls));
end $$;
create or replace function public.quoridor_action(p_room uuid,p_revision int,p_action text,p_payload jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r quoridor_rooms%rowtype; seat int; target int; wr int; wc int; wo text; winner_seat int; next_turn int;
begin
 select * into r from quoridor_rooms where id=p_room for update;
 seat:=array_position(r.player_ids,auth.uid())-1;
 if auth.uid() is null or seat is null then raise exception '참가자가 아닙니다.'; end if;
 if p_revision is distinct from r.revision then raise exception '화면이 갱신되었어요. 다시 선택해 주세요.'; end if;
 if p_action='leave' then
  if r.status='WAITING' then
   if seat=0 then delete from quoridor_rooms where id=p_room;
   else
    r.player_ids[seat+1]:=null;r.names[seat+1]:=null;
    update quoridor_rooms set player_ids=r.player_ids,names=r.names,guest_id=r.player_ids[2],guest_name=r.names[2],revision=revision+1,updated_at=now(),last_action='상대를 기다리고 있어요' where id=p_room;
   end if;
  elsif r.status='PLAYING' then
   update quoridor_rooms set status='FINISHED',winner=case when r.capacity=2 then 1-seat else null end,
    last_action='참가자가 나가 경기가 종료되었어요',revision=revision+1,updated_at=now() where id=p_room;
  end if;return;
 end if;
 if p_action='start' then
  if seat<>0 or r.status<>'WAITING' or array_position(r.player_ids,null) is not null then raise exception '정원이 모두 입장하면 방장이 시작할 수 있어요.'; end if;
  update quoridor_rooms set status='PLAYING',turn=floor(random()*r.capacity)::int,revision=revision+1,updated_at=now(),last_action='경기 시작! 반대편 끝줄에 먼저 도착하세요.' where id=p_room;return;
 end if;
 if r.status<>'PLAYING' or seat<>r.turn then raise exception '내 차례에 선택해 주세요.'; end if;
 next_turn:=case when r.capacity=4 then (array[2,3,1,0])[seat+1] else 1-seat end;
 if p_action='move' then
  target:=(p_payload->>'target')::int;
  if target is null or not target=any(qr_moves_multi((r.positions->>seat)::int,r.positions,seat,r.walls)) then raise exception '이동할 수 없는 칸입니다.'; end if;
  if qr_goal(target,seat) then winner_seat:=seat; end if;
  update quoridor_rooms set positions=jsonb_set(r.positions,array[seat::text],to_jsonb(target)),winner=winner_seat,
   status=case when winner_seat is null then 'PLAYING' else 'FINISHED' end,turn=next_turn,revision=revision+1,updated_at=now(),
   last_action=r.names[seat+1]||case when winner_seat is null then '님이 이동했어요' else '님이 도착했어요. 승리!' end where id=p_room;
 elsif p_action='wall' then
  wr:=(p_payload->>'r')::int;wc:=(p_payload->>'c')::int;wo:=p_payload->>'o';
  if r.remaining[seat+1]<=0 then raise exception '남은 벽이 없어요.'; end if;
  if not qr_wall_valid(r.walls,r.positions,wr,wc,wo) then raise exception '벽이 겹치거나 도착할 길을 막고 있어요. 다른 위치를 골라 주세요.'; end if;
  r.remaining[seat+1]:=r.remaining[seat+1]-1;
  update quoridor_rooms set walls=walls||jsonb_build_array(jsonb_build_object('r',wr,'c',wc,'o',wo,'seat',seat)),remaining=r.remaining,
   turn=next_turn,revision=revision+1,updated_at=now(),last_action=r.names[seat+1]||'님이 벽을 설치했어요' where id=p_room;
 else raise exception '잘못된 요청입니다.';end if;
end $$;
revoke all on function public.qr_goal(int,int),public.qr_moves_multi(int,jsonb,int,jsonb),public.qr_path_seat(int,int,jsonb),public.quoridor_create(int) from public;
grant execute on function public.quoridor_create(int) to authenticated;
commit;
