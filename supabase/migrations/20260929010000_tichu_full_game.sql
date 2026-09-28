begin;

alter table public.tichu_rooms
  add column if not exists target_score int not null default 1000 check (target_score between 100 and 5000),
  add column if not exists turn_seconds int not null default 15 check (turn_seconds between 5 and 120),
  add column if not exists round_no int not null default 0,
  add column if not exists sky_score int not null default 0,
  add column if not exists pink_score int not null default 0,
  add column if not exists turn_deadline timestamptz,
  add column if not exists wish_rank int,
  add column if not exists round_history jsonb not null default '[]'::jsonb,
  add column if not exists last_trick_seat int,
  add column if not exists dragon_pending_seat int,
  add column if not exists dragon_target uuid;

alter table public.tichu_rooms drop constraint if exists tichu_rooms_status_check;
alter table public.tichu_rooms add constraint tichu_rooms_status_check
  check(status in('WAITING','GRAND','EXCHANGE','PLAYING','ROUND_END','FINISHED'));

alter table public.tichu_players
  add column if not exists team int not null default 0 check(team in(0,1)),
  add column if not exists ready boolean not null default false,
  add column if not exists grand_choice boolean,
  add column if not exists grand_called boolean not null default false,
  add column if not exists small_called boolean not null default false,
  add column if not exists has_played boolean not null default false,
  add column if not exists captured int[] not null default '{}';

alter table public.tichu_players drop constraint if exists tichu_players_room_id_seat_key;
alter table public.tichu_players add constraint tichu_players_room_id_seat_key unique(room_id,seat) deferrable initially deferred;

update public.tichu_players set team=seat%2 where team is null or team not in(0,1);

alter table public.tichu_exchanges add column if not exists gifts jsonb not null default '{}'::jsonb;

create table if not exists public.tichu_received_cards(
  room_id uuid not null references public.tichu_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  card int not null,
  primary key(room_id,user_id,from_user_id)
);
alter table public.tichu_received_cards enable row level security;
revoke all on public.tichu_received_cards from anon,authenticated;

create or replace function public.tichu_assert_member(p_room uuid) returns public.tichu_players
language plpgsql stable security definer set search_path=public as $$
declare p public.tichu_players%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into p from public.tichu_players where room_id=p_room and user_id=auth.uid();
  if not found then raise exception '이 방의 참가자가 아닙니다.'; end if;
  return p;
end $$;

create or replace function public.tichu_create_room(p_title text default null,p_target_score int default 1000,p_turn_seconds int default 15)
returns uuid language plpgsql security definer set search_path=public as $$
declare r uuid; c text; member_name text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if exists(select 1 from tichu_players p join tichu_rooms x on x.id=p.room_id where p.user_id=auth.uid() and x.status<>'FINISHED') then
    raise exception '이미 참여 중인 방이 있습니다.';
  end if;
  select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from profiles where id=auth.uid();
  loop c:=upper(substr(md5(random()::text),1,6)); exit when not exists(select 1 from tichu_rooms where code=c); end loop;
  insert into tichu_rooms(code,title,host_id,target_score,turn_seconds)
  values(c,left(coalesce(nullif(trim(p_title),''),member_name||' 방'),30),auth.uid(),greatest(100,least(5000,p_target_score)),greatest(5,least(120,p_turn_seconds))) returning id into r;
  insert into tichu_players(room_id,user_id,seat,team) values(r,auth.uid(),0,0);
  return r;
end $$;

create or replace function public.tichu_join_room(p_room uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; s int; t int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select * into r from tichu_rooms where id=p_room for update;
  if not found or r.status<>'WAITING' then raise exception '참여할 수 없는 방입니다.'; end if;
  if exists(select 1 from tichu_players where room_id=p_room and user_id=auth.uid()) then return p_room; end if;
  if exists(select 1 from tichu_players p join tichu_rooms x on x.id=p.room_id where p.user_id=auth.uid() and x.status<>'FINISHED') then raise exception '먼저 참여 중인 방에서 나가 주세요.'; end if;
  select x into s from generate_series(0,3)x where not exists(select 1 from tichu_players where room_id=p_room and seat=x) order by x limit 1;
  if s is null then raise exception '방이 가득 찼습니다.'; end if;
  select case when count(*) filter(where team=0)<=count(*) filter(where team=1) then 0 else 1 end into t from tichu_players where room_id=p_room;
  insert into tichu_players(room_id,user_id,seat,team) values(p_room,auth.uid(),s,t);
  update tichu_rooms set revision=revision+1,updated_at=now() where id=p_room;
  return p_room;
end $$;

create or replace function public.tichu_set_team(p_room uuid,p_team int) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype;
begin
  perform tichu_assert_member(p_room); select * into r from tichu_rooms where id=p_room for update;
  if r.status<>'WAITING' or p_team not in(0,1) then raise exception '지금은 팀을 바꿀 수 없습니다.'; end if;
  if (select count(*) from tichu_players where room_id=p_room and team=p_team and user_id<>auth.uid())>=2 then raise exception '해당 팀은 가득 찼습니다.'; end if;
  update tichu_players set team=p_team,ready=false where room_id=p_room and user_id=auth.uid();
  update tichu_rooms set revision=revision+1 where id=p_room;
end $$;

create or replace function public.tichu_toggle_ready(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform tichu_assert_member(p_room);
  if (select status from tichu_rooms where id=p_room) not in('WAITING','ROUND_END') then raise exception '지금은 준비할 수 없습니다.'; end if;
  update tichu_players set ready=not ready where room_id=p_room and user_id=auth.uid();
  update tichu_rooms set revision=revision+1 where id=p_room;
end $$;

create or replace function public.tichu_kick(p_room uuid,p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype;
begin
  select * into r from tichu_rooms where id=p_room for update;
  if r.host_id<>auth.uid() or r.status<>'WAITING' then raise exception '방장만 대기 멤버를 내보낼 수 있습니다.'; end if;
  if p_user=r.host_id then raise exception '방장은 자신을 강퇴할 수 없습니다.'; end if;
  delete from tichu_players where room_id=p_room and user_id=p_user;
  update tichu_rooms set revision=revision+1 where id=p_room;
end $$;

create or replace function public.tichu_start_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; p record; deck int[];
begin
  select * into r from tichu_rooms where id=p_room for update;
  if r.host_id<>auth.uid() or r.status not in('WAITING','ROUND_END') then raise exception '방장만 시작할 수 있습니다.'; end if;
  if (select count(*) from tichu_players where room_id=p_room)<>4 or (select count(*) from tichu_players where room_id=p_room and ready)<>4 then raise exception '4명 모두 준비해야 합니다.'; end if;
  if (select count(*) from tichu_players where room_id=p_room and team=0)<>2 or (select count(*) from tichu_players where room_id=p_room and team=1)<>2 then raise exception '각 팀에 2명씩 있어야 합니다.'; end if;
  with ordered as (select user_id,team,row_number() over(partition by team order by joined_at)-1 as n from tichu_players where room_id=p_room)
  update tichu_players tp set seat=case when o.team=0 then o.n*2 else o.n*2+1 end from ordered o where tp.room_id=p_room and tp.user_id=o.user_id;
  delete from tichu_hands where room_id=p_room; delete from tichu_exchanges where room_id=p_room; delete from tichu_finished where room_id=p_room; delete from tichu_received_cards where room_id=p_room;
  select array_agg(x order by random()) into deck from generate_series(0,55)x;
  for p in select * from tichu_players where room_id=p_room loop
    insert into tichu_hands values(p_room,p.user_id,(select array_agg(deck[i] order by deck[i]) from generate_series(p.seat*8+1,p.seat*8+8)i));
  end loop;
  update tichu_players set grand_choice=null,grand_called=false,small_called=false,has_played=false,captured='{}',ready=false where room_id=p_room;
  update tichu_rooms set status='GRAND',round_no=round_no+1,turn_seat=null,lead=null,trick='[]',pass_count=0,wish_rank=null,last_trick_seat=null,dragon_pending_seat=null,dragon_target=null,revision=revision+1,updated_at=now() where id=p_room;
end $$;

create or replace function public.tichu_grand_choice(p_room uuid,p_call boolean) returns void
language plpgsql security definer set search_path=public as $$
declare p record; deck int[]; used int[];
begin
  perform tichu_assert_member(p_room);
  if (select status from tichu_rooms where id=p_room for update)<>'GRAND' then raise exception '라지 티츄 선택 단계가 아닙니다.'; end if;
  update tichu_players set grand_choice=p_call,grand_called=p_call where room_id=p_room and user_id=auth.uid() and grand_choice is null;
  if (select count(*) from tichu_players where room_id=p_room and grand_choice is not null)=4 then
    select coalesce(array_agg(x),'{}') into used from tichu_hands h cross join unnest(h.cards)x where h.room_id=p_room;
    select array_agg(x order by random()) into deck from generate_series(0,55)x where not x=any(used);
    for p in select * from tichu_players where room_id=p_room loop
      update tichu_hands set cards=cards||(select array_agg(deck[i]) from generate_series(p.seat*6+1,p.seat*6+6)i) where room_id=p_room and user_id=p.user_id;
    end loop;
    update tichu_rooms set status='EXCHANGE',revision=revision+1,updated_at=now() where id=p_room;
  else update tichu_rooms set revision=revision+1 where id=p_room; end if;
end $$;

create or replace function public.tichu_declare_small(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform tichu_assert_member(p_room);
  if (select status from tichu_rooms where id=p_room) not in('EXCHANGE','PLAYING') or (select has_played from tichu_players where room_id=p_room and user_id=auth.uid()) then raise exception '첫 카드를 내기 전에만 스몰 티츄를 선언할 수 있습니다.'; end if;
  update tichu_players set small_called=true where room_id=p_room and user_id=auth.uid(); update tichu_rooms set revision=revision+1 where id=p_room;
end $$;

create or replace function public.tichu_give_card(p_room uuid,p_target uuid,p_card int) returns void
language plpgsql security definer set search_path=public as $$
declare h int[]; gifts jsonb;
begin
  perform tichu_assert_member(p_room);
  if (select status from tichu_rooms where id=p_room for update)<>'EXCHANGE' then raise exception '교환 단계가 아닙니다.'; end if;
  if p_target=auth.uid() or not exists(select 1 from tichu_players where room_id=p_room and user_id=p_target) then raise exception '받을 멤버를 확인해 주세요.'; end if;
  select cards into h from tichu_hands where room_id=p_room and user_id=auth.uid(); if not p_card=any(h) then raise exception '내 카드가 아닙니다.'; end if;
  select coalesce(e.gifts,'{}') into gifts from tichu_exchanges e where room_id=p_room and user_id=auth.uid();
  if gifts ? p_target::text then raise exception '각 멤버에게 한 장씩만 줄 수 있습니다.'; end if;
  if exists(select 1 from jsonb_each_text(gifts) x where x.value::int=p_card) then raise exception '이미 선택한 카드입니다.'; end if;
  insert into tichu_exchanges(room_id,user_id,cards,gifts) values(p_room,auth.uid(),array[p_card],jsonb_build_object(p_target::text,p_card))
  on conflict(room_id,user_id) do update set cards=tichu_exchanges.cards||p_card,gifts=tichu_exchanges.gifts||jsonb_build_object(p_target::text,p_card);
  if (select count(*) from tichu_exchanges e where room_id=p_room and (select count(*) from jsonb_object_keys(e.gifts))=3)=4 then perform public.tichu_finish_exchange(p_room); else update tichu_rooms set revision=revision+1 where id=p_room; end if;
end $$;

create or replace function public.tichu_finish_exchange(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare e record; gift record; startseat int; seconds int;
begin
  for e in select * from tichu_exchanges where room_id=p_room loop
    update tichu_hands set cards=array(select x from unnest(cards)x where not x=any(e.cards)) where room_id=p_room and user_id=e.user_id;
    for gift in select key::uuid as target,value::int as card from jsonb_each_text(e.gifts) loop
      update tichu_hands set cards=array_append(cards,gift.card) where room_id=p_room and user_id=gift.target;
      insert into tichu_received_cards values(p_room,gift.target,e.user_id,gift.card);
    end loop;
  end loop;
  select p.seat into startseat from tichu_hands h join tichu_players p using(room_id,user_id) where h.room_id=p_room and 52=any(h.cards);
  select turn_seconds into seconds from tichu_rooms where id=p_room;
  update tichu_rooms set status='PLAYING',turn_seat=startseat,turn_deadline=now()+make_interval(secs=>seconds),revision=revision+1,updated_at=now() where id=p_room;
end $$;

create or replace function public.tichu_next_seat(p_room uuid,p_seat int) returns int
language plpgsql stable security definer set search_path=public as $$
declare n int; begin for i in 1..4 loop n:=(p_seat+i)%4; if exists(select 1 from tichu_players p join tichu_hands h using(room_id,user_id) where p.room_id=p_room and p.seat=n and cardinality(h.cards)>0) then return n; end if; end loop; return null; end $$;

create or replace function public.tichu_card_points(p_cards int[]) returns int language sql immutable as $$
 select coalesce(sum(case when x=55 then 25 when x=54 then -25 when x<52 and (x/4+2)=5 then 5 when x<52 and (x/4+2) in(10,13) then 10 else 0 end),0)::int from unnest(p_cards)x $$;

create or replace function public.tichu_end_round(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare first_user uuid; last_user uuid; last_team int; receiver uuid; sky int:=0; pink int:=0; p record; bonus int; r tichu_rooms%rowtype; double_team int; hist jsonb;
begin
  select * into r from tichu_rooms where id=p_room for update;
  select user_id into first_user from tichu_finished where room_id=p_room and finish_order=1;
  select p.user_id,p.team into last_user,last_team from tichu_players p where p.room_id=p_room and not exists(select 1 from tichu_finished f where f.room_id=p.room_id and f.user_id=p.user_id);
  select p.team into double_team from tichu_finished f join tichu_players p using(room_id,user_id) where f.room_id=p_room and f.finish_order in(1,2) group by p.team having count(*)=2;
  if double_team is not null then if double_team=0 then sky:=200; else pink:=200; end if;
  else
    select user_id into receiver from tichu_players where room_id=p_room and team<>last_team order by seat limit 1;
    update tichu_players set captured=captured||(select cards from tichu_hands where room_id=p_room and user_id=last_user) where room_id=p_room and user_id=receiver;
    update tichu_players set captured=captured||(select captured from tichu_players where room_id=p_room and user_id=last_user) where room_id=p_room and user_id=first_user;
    for p in select team,captured from tichu_players where room_id=p_room loop if p.team=0 then sky:=sky+tichu_card_points(p.captured); else pink:=pink+tichu_card_points(p.captured); end if; end loop;
  end if;
  for p in select * from tichu_players where room_id=p_room loop
    bonus:=case when p.grand_called then 200 when p.small_called then 100 else 0 end;
    if bonus>0 and p.user_id<>first_user then bonus:=-bonus; end if;
    if p.team=0 then sky:=sky+bonus; else pink:=pink+bonus; end if;
  end loop;
  hist:=jsonb_build_object('round',r.round_no,'sky',sky,'pink',pink,'first_user',first_user);
  update tichu_rooms set sky_score=sky_score+sky,pink_score=pink_score+pink,round_history=round_history||jsonb_build_array(hist),status=case when (sky_score+sky>=target_score or pink_score+pink>=target_score) and sky_score+sky<>pink_score+pink then 'FINISHED' else 'ROUND_END' end,winner_team=case when (sky_score+sky>=target_score or pink_score+pink>=target_score) and sky_score+sky<>pink_score+pink then case when sky_score+sky>pink_score+pink then 0 else 1 end else null end,turn_seat=null,turn_deadline=null,revision=revision+1,updated_at=now() where id=p_room;
end $$;

create or replace function public.tichu_play(p_room uuid,p_cards int[],p_combo jsonb,p_wish int default null,p_dragon_target uuid default null) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; me tichu_players%rowtype; h int[]; nextseat int; lastseat int; active_count int; opp_team int;
begin
  select * into r from tichu_rooms where id=p_room for update; me:=tichu_assert_member(p_room);
  if r.status<>'PLAYING' or (me.seat<>r.turn_seat and not coalesce((p_combo->>'bomb')::boolean,false)) then raise exception '지금은 내 차례가 아닙니다.'; end if;
  select cards into h from tichu_hands where room_id=p_room and user_id=auth.uid();
  if cardinality(p_cards)<1 or not p_cards<@h or (select count(distinct x) from unnest(p_cards)x)<>cardinality(p_cards) then raise exception '카드를 확인해 주세요.'; end if;
  if 53=any(p_cards) and (cardinality(p_cards)<>1 or r.lead is not null) then raise exception '개는 새 트릭의 첫 카드로만 낼 수 있습니다.'; end if;
  if 52=any(p_cards) and (p_wish is null or p_wish not between 2 and 14) then raise exception '참새의 소원 숫자를 선택해 주세요.'; end if;
  if r.wish_rank is not null and exists(select 1 from unnest(h)x where x<52 and x/4+2=r.wish_rank) and not exists(select 1 from unnest(p_cards)x where x<52 and x/4+2=r.wish_rank) then raise exception '가능하다면 참새의 소원을 지켜야 합니다.'; end if;
  if r.lead is not null and not (
    ((p_combo->>'bomb')::boolean and not coalesce((r.lead->>'bomb')::boolean,false)) or
    ((p_combo->>'bomb')::boolean and coalesce((r.lead->>'bomb')::boolean,false) and ((p_combo->>'size')::int>(r.lead->>'size')::int or ((p_combo->>'size')::int=(r.lead->>'size')::int and (p_combo->>'strength')::numeric>(r.lead->>'strength')::numeric))) or
    (not coalesce((r.lead->>'bomb')::boolean,false) and (r.lead->>'kind')=(p_combo->>'kind') and (r.lead->>'size')=(p_combo->>'size') and (p_combo->>'strength')::numeric>(r.lead->>'strength')::numeric)
  ) then raise exception '앞의 조합보다 강한 같은 조합을 내야 합니다.'; end if;
  if 55=any(p_cards) then
    if p_dragon_target is null or not exists(select 1 from tichu_players where room_id=p_room and user_id=p_dragon_target and team<>me.team) then raise exception '용 트릭을 받을 상대를 선택해 주세요.'; end if;
  end if;
  update tichu_hands set cards=array(select x from unnest(cards)x where not x=any(p_cards)) where room_id=p_room and user_id=auth.uid(); update tichu_players set has_played=true where room_id=p_room and user_id=auth.uid();
  if cardinality(h)=cardinality(p_cards) then insert into tichu_finished values(p_room,auth.uid(),(select count(*)+1 from tichu_finished where room_id=p_room)); end if;
  if 53=any(p_cards) then select seat into nextseat from tichu_players where room_id=p_room and team=me.team and user_id<>auth.uid(); if not exists(select 1 from tichu_players p join tichu_hands hh using(room_id,user_id) where p.room_id=p_room and p.seat=nextseat and cardinality(hh.cards)>0) then nextseat=tichu_next_seat(p_room,nextseat); end if; update tichu_rooms set turn_seat=nextseat,turn_deadline=now()+make_interval(secs=>turn_seconds),lead=null,trick='[]',pass_count=0,revision=revision+1,wish_rank=coalesce(p_wish,wish_rank) where id=p_room;
  else
    nextseat=tichu_next_seat(p_room,me.seat); update tichu_rooms set turn_seat=nextseat,turn_deadline=now()+make_interval(secs=>turn_seconds),lead=p_combo,trick=trick||jsonb_build_array(jsonb_build_object('seat',me.seat,'cards',p_cards)),pass_count=0,last_trick_seat=me.seat,dragon_target=case when 55=any(p_cards) then p_dragon_target else dragon_target end,revision=revision+1,wish_rank=case when p_wish is not null then p_wish when r.wish_rank is not null and exists(select 1 from unnest(p_cards)x where x<52 and x/4+2=r.wish_rank) then null else r.wish_rank end where id=p_room;
  end if;
  select count(*) into active_count from tichu_hands where room_id=p_room and cardinality(cards)>0; if active_count<=1 then perform tichu_end_round(p_room); end if;
end $$;

create or replace function public.tichu_pass(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; me tichu_players%rowtype; active_count int; winner int;
begin
  select * into r from tichu_rooms where id=p_room for update; me:=tichu_assert_member(p_room);
  if r.status<>'PLAYING' or me.seat<>r.turn_seat or r.lead is null then raise exception '패스할 수 없습니다.'; end if;
  select count(*) into active_count from tichu_hands where room_id=p_room and cardinality(cards)>0;
  if r.pass_count>=greatest(active_count-2,0) then
    winner:=r.last_trick_seat; update tichu_players set captured=captured||(select coalesce(array_agg(c::int),'{}') from jsonb_array_elements(r.trick)t cross join jsonb_array_elements_text(t->'cards')c) where room_id=p_room and (case when r.dragon_target is not null then user_id=r.dragon_target else seat=winner end);
    if not exists(select 1 from tichu_players p join tichu_hands h using(room_id,user_id) where p.room_id=p_room and p.seat=winner and cardinality(h.cards)>0) then winner=tichu_next_seat(p_room,winner); end if;
    update tichu_rooms set turn_seat=winner,lead=null,trick='[]',pass_count=0,dragon_target=null,turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1 where id=p_room;
  else update tichu_rooms set turn_seat=tichu_next_seat(p_room,me.seat),pass_count=pass_count+1,turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1 where id=p_room; end if;
end $$;

create or replace function public.tichu_timeout(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype;
begin
  perform tichu_assert_member(p_room); select * into r from tichu_rooms where id=p_room for update;
  if r.status<>'PLAYING' or r.turn_deadline is null or r.turn_deadline>now() then return; end if;
  if r.lead is null then update tichu_rooms set turn_deadline=now()+make_interval(secs=>turn_seconds) where id=p_room;
  else update tichu_rooms set turn_seat=tichu_next_seat(p_room,r.turn_seat),pass_count=pass_count+1,turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1 where id=p_room; end if;
end $$;

create or replace function public.tichu_snapshot(p_room uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'room',to_jsonb(r),
  'me',jsonb_build_object('user_id',auth.uid(),'seat',me.seat,'team',me.team,'cards',coalesce(h.cards,'{}'),'ready',me.ready,'grand_choice',me.grand_choice,'grand_called',me.grand_called,'small_called',me.small_called,'has_played',me.has_played),
  'players',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'seat',p.seat,'team',p.team,'name',coalesce(pr.activity_name,'멤버'),'gender',pr.gender,'count',coalesce(cardinality(hh.cards),0),'ready',p.ready,'grand_choice',p.grand_choice,'grand_called',p.grand_called,'small_called',p.small_called,'finish_order',f.finish_order) order by p.seat) from tichu_players p left join profiles pr on pr.id=p.user_id left join tichu_hands hh using(room_id,user_id) left join tichu_finished f using(room_id,user_id) where p.room_id=r.id),'[]'::jsonb),
  'exchange_count',(select count(*) from tichu_exchanges e where room_id=r.id and (select count(*) from jsonb_object_keys(e.gifts))=3),
  'my_gifts',coalesce((select gifts from tichu_exchanges where room_id=r.id and user_id=auth.uid()),'{}'::jsonb),
  'received',coalesce((select jsonb_agg(jsonb_build_object('card',x.card,'from_user_id',x.from_user_id,'from_name',coalesce(pr.activity_name,'멤버'))) from tichu_received_cards x left join profiles pr on pr.id=x.from_user_id where x.room_id=r.id and x.user_id=auth.uid()),'[]'::jsonb)
 ) from tichu_rooms r join tichu_players me on me.room_id=r.id and me.user_id=auth.uid() left join tichu_hands h on h.room_id=r.id and h.user_id=auth.uid() where r.id=p_room;
$$;

create or replace function public.tichu_lobby() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'status',r.status,'players',(select count(*) from tichu_players p where p.room_id=r.id),'mine',exists(select 1 from tichu_players p where p.room_id=r.id and p.user_id=auth.uid()),'host_name',coalesce(pr.activity_name,'멤버'),'target_score',r.target_score,'turn_seconds',r.turn_seconds) order by r.created_at desc),'[]') from tichu_rooms r left join profiles pr on pr.id=r.host_id where r.status<>'FINISHED' or r.updated_at>now()-interval '1 hour' $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('tichu_create_room','tichu_join_room','tichu_set_team','tichu_toggle_ready','tichu_kick','tichu_leave_room','tichu_start_room','tichu_grand_choice','tichu_declare_small','tichu_give_card','tichu_play','tichu_pass','tichu_timeout','tichu_snapshot','tichu_lobby') loop execute format('revoke all on function %s from public,anon',f.sig); execute format('grant execute on function %s to authenticated',f.sig); end loop;
end $$;

commit;
