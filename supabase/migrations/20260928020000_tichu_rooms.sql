begin;
create table public.tichu_rooms(
 id uuid primary key default gen_random_uuid(), code text unique not null,
 title text not null, host_id uuid not null references auth.users(id),
 status text not null default 'WAITING' check(status in('WAITING','EXCHANGE','PLAYING','FINISHED')),
 turn_seat int, lead jsonb, trick jsonb not null default '[]', pass_count int not null default 0,
 winner_team int, revision bigint not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tichu_players(
 room_id uuid references public.tichu_rooms(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
 seat int not null check(seat between 0 and 3), joined_at timestamptz not null default now(), primary key(room_id,user_id), unique(room_id,seat)
);
create table public.tichu_hands(room_id uuid references public.tichu_rooms(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,cards int[] not null,primary key(room_id,user_id));
create table public.tichu_exchanges(room_id uuid references public.tichu_rooms(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,cards int[] not null,primary key(room_id,user_id));
create table public.tichu_finished(room_id uuid references public.tichu_rooms(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,finish_order int not null,primary key(room_id,user_id),unique(room_id,finish_order));
alter table public.tichu_rooms enable row level security; alter table public.tichu_players enable row level security; alter table public.tichu_hands enable row level security; alter table public.tichu_exchanges enable row level security; alter table public.tichu_finished enable row level security;
revoke all on public.tichu_rooms,public.tichu_players,public.tichu_hands,public.tichu_exchanges,public.tichu_finished from anon,authenticated;

create function public.tichu_create_room(p_title text default '즐거운 티츄') returns uuid language plpgsql security definer set search_path=public as $$
declare r uuid; c text;
begin if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 loop c:=upper(substr(md5(random()::text),1,6)); exit when not exists(select 1 from tichu_rooms where code=c); end loop;
 insert into tichu_rooms(code,title,host_id) values(c,left(coalesce(nullif(trim(p_title),''),'즐거운 티츄'),30),auth.uid()) returning id into r;
 insert into tichu_players values(r,auth.uid(),0,now()); return r; end $$;

create function public.tichu_join_room(p_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; s int;
begin if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if; select * into r from tichu_rooms where code=upper(trim(p_code)) for update;
 if not found or r.status<>'WAITING' then raise exception '참여할 수 없는 방입니다.'; end if; if exists(select 1 from tichu_players where room_id=r.id and user_id=auth.uid()) then return r.id; end if;
 select x into s from generate_series(0,3)x where not exists(select 1 from tichu_players where room_id=r.id and seat=x) order by x limit 1; if s is null then raise exception '방이 가득 찼습니다.'; end if;
 insert into tichu_players values(r.id,auth.uid(),s,now()); update tichu_rooms set revision=revision+1,updated_at=now() where id=r.id; return r.id; end $$;

create function public.tichu_leave_room(p_room uuid) returns void language plpgsql security definer set search_path=public as $$
declare h uuid; st text; begin select host_id,status into h,st from tichu_rooms where id=p_room for update; if not exists(select 1 from tichu_players where room_id=p_room and user_id=auth.uid()) then return; end if;
 if st<>'WAITING' then raise exception '게임이 시작된 뒤에는 나갈 수 없습니다.'; end if; if h=auth.uid() then delete from tichu_rooms where id=p_room; else delete from tichu_players where room_id=p_room and user_id=auth.uid(); update tichu_rooms set revision=revision+1 where id=p_room; end if; end $$;

create function public.tichu_start_room(p_room uuid) returns void language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; p record; deck int[]; begin select * into r from tichu_rooms where id=p_room for update; if r.host_id<>auth.uid() or r.status<>'WAITING' then raise exception '방장만 시작할 수 있습니다.'; end if;
 if (select count(*) from tichu_players where room_id=p_room)<>4 then raise exception '4명이 모여야 시작할 수 있습니다.'; end if; select array_agg(x order by random()) into deck from generate_series(0,55)x;
 for p in select * from tichu_players where room_id=p_room loop insert into tichu_hands values(p_room,p.user_id,(select array_agg(deck[i] order by deck[i]) from generate_series(p.seat*14+1,p.seat*14+14)i)); end loop;
 update tichu_rooms set status='EXCHANGE',revision=revision+1,updated_at=now() where id=p_room; end $$;

create function public.tichu_exchange(p_room uuid,p_cards int[]) returns void language plpgsql security definer set search_path=public as $$
declare h int[]; p record; src record; target uuid; startseat int; begin if cardinality(p_cards)<>3 or (select count(distinct x) from unnest(p_cards)x)<>3 then raise exception '서로 다른 카드 3장을 골라 주세요.'; end if;
 select cards into h from tichu_hands where room_id=p_room and user_id=auth.uid(); if not p_cards<@h then raise exception '내 카드가 아닙니다.'; end if;
 insert into tichu_exchanges values(p_room,auth.uid(),p_cards) on conflict(room_id,user_id) do update set cards=excluded.cards;
 if (select count(*) from tichu_exchanges where room_id=p_room)=4 then
  for src in select e.user_id,e.cards,pl.seat from tichu_exchanges e join tichu_players pl using(room_id,user_id) where e.room_id=p_room loop
   update tichu_hands set cards=array(select x from unnest(cards)x where not x=any(src.cards)) where room_id=p_room and user_id=src.user_id;
   for i in 1..3 loop select user_id into target from tichu_players where room_id=p_room and seat=(src.seat+i)%4; update tichu_hands set cards=array_append(cards,src.cards[i]) where room_id=p_room and user_id=target; end loop;
  end loop;
  select pl.seat into strict startseat from tichu_hands h join tichu_players pl using(room_id,user_id) where h.room_id=p_room and 52=any(h.cards); delete from tichu_exchanges where room_id=p_room;
  update tichu_rooms set status='PLAYING',turn_seat=startseat,revision=revision+1,updated_at=now() where id=p_room;
 else update tichu_rooms set revision=revision+1 where id=p_room; end if; end $$;

create function public.tichu_next_seat(p_room uuid,p_seat int) returns int language plpgsql stable security definer set search_path=public as $$
declare n int; begin for i in 1..4 loop n:=(p_seat+i)%4; if exists(select 1 from tichu_players p join tichu_hands h using(room_id,user_id) where p.room_id=p_room and p.seat=n and cardinality(h.cards)>0) then return n; end if; end loop; return null; end $$;

create function public.tichu_play(p_room uuid,p_cards int[],p_combo jsonb) returns void language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; me int; h int[]; nextseat int; team int; mate_done boolean; begin select * into r from tichu_rooms where id=p_room for update; select seat into me from tichu_players where room_id=p_room and user_id=auth.uid();
 if r.status<>'PLAYING' or me is null or me<>r.turn_seat then raise exception '지금은 내 차례가 아닙니다.'; end if; select cards into h from tichu_hands where room_id=p_room and user_id=auth.uid();
 if cardinality(p_cards)<1 or not p_cards<@h or (select count(distinct x) from unnest(p_cards)x)<>cardinality(p_cards) then raise exception '카드를 확인해 주세요.'; end if;
 if r.lead is not null and not ((p_combo->>'bomb')::boolean or ((r.lead->>'kind')=(p_combo->>'kind') and (r.lead->>'size')=(p_combo->>'size') and (p_combo->>'strength')::numeric>(r.lead->>'strength')::numeric)) then raise exception '앞의 조합보다 강한 같은 조합을 내야 합니다.'; end if;
 update tichu_hands set cards=array(select x from unnest(cards)x where not x=any(p_cards)) where room_id=p_room and user_id=auth.uid();
 if cardinality(h)=cardinality(p_cards) then insert into tichu_finished values(p_room,auth.uid(),(select count(*)+1 from tichu_finished where room_id=p_room)); select me%2 into team; select exists(select 1 from tichu_finished f join tichu_players p using(room_id,user_id) where f.room_id=p_room and p.seat%2=team and p.user_id<>auth.uid()) into mate_done; end if;
 nextseat=public.tichu_next_seat(p_room,me); if mate_done then update tichu_rooms set status='FINISHED',winner_team=team,turn_seat=null,lead=p_combo,trick=trick||jsonb_build_array(jsonb_build_object('seat',me,'cards',p_cards)),revision=revision+1 where id=p_room; else update tichu_rooms set turn_seat=nextseat,lead=p_combo,trick=trick||jsonb_build_array(jsonb_build_object('seat',me,'cards',p_cards)),pass_count=0,revision=revision+1,updated_at=now() where id=p_room; end if; end $$;

create function public.tichu_pass(p_room uuid) returns void language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; me int; lastseat int; begin select * into r from tichu_rooms where id=p_room for update; select seat into me from tichu_players where room_id=p_room and user_id=auth.uid(); if r.status<>'PLAYING' or me<>r.turn_seat or r.lead is null then raise exception '패스할 수 없습니다.'; end if;
 if r.pass_count>=(select greatest(count(*)-2,0) from tichu_hands where room_id=p_room and cardinality(cards)>0) then select (x.value->>'seat')::int into lastseat from jsonb_array_elements(r.trick) with ordinality x(value,n) order by x.n desc limit 1; if not exists(select 1 from tichu_players p join tichu_hands h using(room_id,user_id) where p.room_id=p_room and p.seat=lastseat and cardinality(h.cards)>0) then lastseat=public.tichu_next_seat(p_room,lastseat); end if; update tichu_rooms set turn_seat=lastseat,lead=null,trick='[]',pass_count=0,revision=revision+1 where id=p_room; else update tichu_rooms set turn_seat=public.tichu_next_seat(p_room,me),pass_count=pass_count+1,revision=revision+1 where id=p_room; end if; end $$;

create function public.tichu_snapshot(p_room uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('room',to_jsonb(r),'me',jsonb_build_object('user_id',auth.uid(),'seat',me.seat,'cards',coalesce(h.cards,'{}')),'players',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'seat',p.seat,'name',coalesce(pr.activity_name,'멤버'),'count',coalesce(cardinality(hh.cards),0)) order by p.seat) from tichu_players p left join profiles pr on pr.id=p.user_id left join tichu_hands hh using(room_id,user_id) where p.room_id=r.id),'[]'::jsonb),'exchange_count',(select count(*) from tichu_exchanges where room_id=r.id)) from tichu_rooms r join tichu_players me on me.room_id=r.id and me.user_id=auth.uid() left join tichu_hands h on h.room_id=r.id and h.user_id=auth.uid() where r.id=p_room;
$$;
create function public.tichu_lobby() returns jsonb language sql stable security definer set search_path=public as $$ select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'title',r.title,'status',r.status,'players',(select count(*) from tichu_players p where p.room_id=r.id),'mine',exists(select 1 from tichu_players p where p.room_id=r.id and p.user_id=auth.uid())) order by r.created_at desc),'[]') from tichu_rooms r where r.status<>'FINISHED' or r.updated_at>now()-interval '1 hour' $$;
revoke all on function public.tichu_create_room(text),public.tichu_join_room(text),public.tichu_leave_room(uuid),public.tichu_start_room(uuid),public.tichu_exchange(uuid,int[]),public.tichu_play(uuid,int[],jsonb),public.tichu_pass(uuid),public.tichu_snapshot(uuid),public.tichu_lobby(),public.tichu_next_seat(uuid,int) from public,anon;
grant execute on function public.tichu_create_room(text),public.tichu_join_room(text),public.tichu_leave_room(uuid),public.tichu_start_room(uuid),public.tichu_exchange(uuid,int[]),public.tichu_play(uuid,int[],jsonb),public.tichu_pass(uuid),public.tichu_snapshot(uuid),public.tichu_lobby() to authenticated;
commit;
