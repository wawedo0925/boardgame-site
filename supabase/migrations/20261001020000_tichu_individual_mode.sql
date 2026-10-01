begin;

alter table public.tichu_rooms
  add column if not exists game_mode text not null default 'TEAM',
  add column if not exists winner_user_id uuid;
alter table public.tichu_rooms drop constraint if exists tichu_rooms_game_mode_check;
alter table public.tichu_rooms add constraint tichu_rooms_game_mode_check check(game_mode in('TEAM','INDIVIDUAL'));
alter table public.tichu_players add column if not exists score int not null default 0;

drop function if exists public.tichu_create_room(text,int,int);
create function public.tichu_create_room(p_title text default null,p_target_score int default 1000,p_turn_seconds int default 15,p_game_mode text default 'TEAM')
returns uuid language plpgsql security definer set search_path=public as $$
declare r uuid; c text; member_name text; mode text:=upper(coalesce(p_game_mode,'TEAM'));
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if mode not in('TEAM','INDIVIDUAL') then raise exception '게임 방식을 확인해 주세요.'; end if;
  if exists(select 1 from tichu_players p join tichu_rooms x on x.id=p.room_id where p.user_id=auth.uid() and x.status<>'FINISHED') then raise exception '이미 참여 중인 방이 있습니다.'; end if;
  select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from profiles where id=auth.uid();
  loop c:=upper(substr(md5(random()::text),1,6)); exit when not exists(select 1 from tichu_rooms where code=c); end loop;
  insert into tichu_rooms(code,title,host_id,target_score,turn_seconds,game_mode)
  values(c,left(coalesce(nullif(trim(p_title),''),member_name||' 방'),30),auth.uid(),greatest(100,least(5000,p_target_score)),greatest(5,least(120,p_turn_seconds)),mode) returning id into r;
  insert into tichu_players(room_id,user_id,seat,team) values(r,auth.uid(),0,0);
  return r;
end $$;

create or replace function public.tichu_start_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; p record; deck int[];
begin
  select * into r from tichu_rooms where id=p_room for update;
  if r.host_id<>auth.uid() or r.status not in('WAITING','ROUND_END') then raise exception '방장만 시작할 수 있습니다.'; end if;
  if (select count(*) from tichu_players where room_id=p_room)<>4 or (select count(*) from tichu_players where room_id=p_room and ready)<>4 then raise exception '4명 모두 준비해야 합니다.'; end if;
  if r.game_mode='TEAM' then
    if (select count(*) from tichu_players where room_id=p_room and team=0)<>2 or (select count(*) from tichu_players where room_id=p_room and team=1)<>2 then raise exception '각 팀에 2명씩 있어야 합니다.'; end if;
    with ordered as (select user_id,team,row_number() over(partition by team order by joined_at)-1 as n from tichu_players where room_id=p_room)
    update tichu_players tp set seat=case when o.team=0 then o.n*2 else o.n*2+1 end from ordered o where tp.room_id=p_room and tp.user_id=o.user_id;
  end if;
  delete from tichu_hands where room_id=p_room; delete from tichu_exchanges where room_id=p_room; delete from tichu_finished where room_id=p_room; delete from tichu_received_cards where room_id=p_room;
  select array_agg(x order by random()) into deck from generate_series(0,55)x;
  for p in select * from tichu_players where room_id=p_room loop
    insert into tichu_hands values(p_room,p.user_id,(select array_agg(deck[i] order by deck[i]) from generate_series(p.seat*8+1,p.seat*8+8)i));
  end loop;
  update tichu_players set grand_choice=null,grand_called=false,small_called=false,has_played=false,captured='{}',ready=false where room_id=p_room;
  update tichu_rooms set status='GRAND',round_no=round_no+1,turn_seat=null,lead=null,trick='[]',pass_count=0,wish_rank=null,last_trick_seat=null,dragon_pending_seat=null,dragon_target=null,winner_user_id=null,revision=revision+1,updated_at=now() where id=p_room;
end $$;

create or replace function public.tichu_end_round(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare first_user uuid; last_user uuid; last_team int; receiver uuid; sky int:=0; pink int:=0; p record; bonus int; r tichu_rooms%rowtype; double_team int; hist jsonb; round_score int; scores jsonb:='{}'; top_score int; top_count int; winner uuid;
begin
  select * into r from tichu_rooms where id=p_room for update;
  select user_id into first_user from tichu_finished where room_id=p_room and finish_order=1;
  select tp.user_id,tp.team into last_user,last_team from tichu_players tp where tp.room_id=p_room and not exists(select 1 from tichu_finished f where f.room_id=tp.room_id and f.user_id=tp.user_id);
  if r.game_mode='INDIVIDUAL' then
    if last_user is not null then
      insert into tichu_finished(room_id,user_id,finish_order) values(p_room,last_user,4) on conflict do nothing;
      update tichu_players set captured=captured||coalesce((select cards from tichu_hands where room_id=p_room and user_id=last_user),'{}')||coalesce((select captured from tichu_players where room_id=p_room and user_id=last_user),'{}') where room_id=p_room and user_id=first_user;
      update tichu_players set captured='{}' where room_id=p_room and user_id=last_user and user_id<>first_user;
    end if;
    for p in select tp.*,f.finish_order from tichu_players tp join tichu_finished f using(room_id,user_id) where tp.room_id=p_room loop
      round_score:=public.tichu_card_points(p.captured)+case p.finish_order when 1 then 60 when 2 then 40 when 3 then 20 else 0 end;
      bonus:=case when p.grand_called then 200 when p.small_called then 100 else 0 end;
      if bonus>0 and p.finish_order<>1 then bonus:=-bonus; end if;
      round_score:=round_score+bonus;
      update tichu_players set score=score+round_score where room_id=p_room and user_id=p.user_id;
      scores:=scores||jsonb_build_object(p.user_id::text,round_score);
    end loop;
    select max(score) into top_score from tichu_players where room_id=p_room;
    select count(*) into top_count from tichu_players where room_id=p_room and score=top_score;
    select user_id into winner from tichu_players where room_id=p_room and score=top_score order by seat limit 1;
    hist:=jsonb_build_object('round',r.round_no,'individual',scores,'first_user',first_user);
    update tichu_rooms set round_history=round_history||jsonb_build_array(hist),status=case when top_score>=target_score and top_count=1 then 'FINISHED' else 'ROUND_END' end,winner_user_id=case when top_score>=target_score and top_count=1 then winner else null end,winner_team=null,turn_seat=null,turn_deadline=null,revision=revision+1,updated_at=now() where id=p_room;
    return;
  end if;
  select tp.team into double_team from tichu_finished f join tichu_players tp using(room_id,user_id) where f.room_id=p_room and f.finish_order in(1,2) group by tp.team having count(*)=2;
  if double_team is not null then if double_team=0 then sky:=200; else pink:=200; end if;
  else
    select user_id into receiver from tichu_players where room_id=p_room and team<>last_team order by seat limit 1;
    update tichu_players set captured=captured||(select cards from tichu_hands where room_id=p_room and user_id=last_user) where room_id=p_room and user_id=receiver;
    update tichu_players set captured=captured||(select captured from tichu_players where room_id=p_room and user_id=last_user) where room_id=p_room and user_id=first_user;
    for p in select team,captured from tichu_players where room_id=p_room loop if p.team=0 then sky:=sky+tichu_card_points(p.captured); else pink:=pink+tichu_card_points(p.captured); end if; end loop;
  end if;
  for p in select * from tichu_players where room_id=p_room loop bonus:=case when p.grand_called then 200 when p.small_called then 100 else 0 end; if bonus>0 and p.user_id<>first_user then bonus:=-bonus; end if; if p.team=0 then sky:=sky+bonus; else pink:=pink+bonus; end if; end loop;
  hist:=jsonb_build_object('round',r.round_no,'sky',sky,'pink',pink,'first_user',first_user);
  update tichu_rooms set sky_score=sky_score+sky,pink_score=pink_score+pink,round_history=round_history||jsonb_build_array(hist),status=case when (sky_score+sky>=target_score or pink_score+pink>=target_score) and sky_score+sky<>pink_score+pink then 'FINISHED' else 'ROUND_END' end,winner_team=case when (sky_score+sky>=target_score or pink_score+pink>=target_score) and sky_score+sky<>pink_score+pink then case when sky_score+sky>pink_score+pink then 0 else 1 end else null end,turn_seat=null,turn_deadline=null,revision=revision+1,updated_at=now() where id=p_room;
end $$;

create or replace function public.tichu_play(p_room uuid,p_cards int[],p_combo jsonb,p_wish int default null,p_dragon_target uuid default null) returns void
language plpgsql security definer set search_path=public as $$
declare r tichu_rooms%rowtype; me tichu_players%rowtype; h int[]; nextseat int; active_count int;
begin
  select * into r from tichu_rooms where id=p_room for update; me:=tichu_assert_member(p_room);
  if r.status<>'PLAYING' or (me.seat<>r.turn_seat and not coalesce((p_combo->>'bomb')::boolean,false)) then raise exception '지금은 내 차례가 아닙니다.'; end if;
  select cards into h from tichu_hands where room_id=p_room and user_id=auth.uid();
  if cardinality(p_cards)<1 or not p_cards<@h or (select count(distinct x) from unnest(p_cards)x)<>cardinality(p_cards) then raise exception '카드를 확인해 주세요.'; end if;
  if 53=any(p_cards) and (cardinality(p_cards)<>1 or r.lead is not null) then raise exception '개는 새 트릭의 첫 카드로만 낼 수 있습니다.'; end if;
  if 52=any(p_cards) and p_wish is not null and p_wish not between 2 and 14 then raise exception '참새의 소원은 2부터 A까지만 선택할 수 있습니다.'; end if;
  if r.wish_rank is not null and me.seat=r.turn_seat and not exists(select 1 from unnest(p_cards)x where x<52 and x/4+2=r.wish_rank) and public.tichu_can_fulfill_wish(h,r.wish_rank,r.lead) then raise exception '현재 조합으로 낼 수 있는 참새 소원 카드를 포함해야 합니다.'; end if;
  if r.lead is not null and not (((p_combo->>'bomb')::boolean and not coalesce((r.lead->>'bomb')::boolean,false)) or ((p_combo->>'bomb')::boolean and coalesce((r.lead->>'bomb')::boolean,false) and ((p_combo->>'size')::int>(r.lead->>'size')::int or ((p_combo->>'size')::int=(r.lead->>'size')::int and (p_combo->>'strength')::numeric>(r.lead->>'strength')::numeric))) or (not coalesce((r.lead->>'bomb')::boolean,false) and (r.lead->>'kind')=(p_combo->>'kind') and (r.lead->>'size')=(p_combo->>'size') and (p_combo->>'strength')::numeric>(r.lead->>'strength')::numeric)) then raise exception '앞의 조합보다 강한 같은 조합을 내야 합니다.'; end if;
  if 55=any(p_cards) and (p_dragon_target is null or not exists(select 1 from tichu_players p join tichu_hands hh using(room_id,user_id) where p.room_id=p_room and p.user_id=p_dragon_target and p.user_id<>auth.uid() and cardinality(hh.cards)>0 and (r.game_mode='INDIVIDUAL' or p.team<>me.team))) then raise exception '용 트릭을 받을 상대를 선택해 주세요.'; end if;
  if 53=any(p_cards) and r.game_mode='INDIVIDUAL' and (p_dragon_target is null or not exists(select 1 from tichu_players p join tichu_hands hh using(room_id,user_id) where p.room_id=p_room and p.user_id=p_dragon_target and p.user_id<>auth.uid() and cardinality(hh.cards)>0)) then raise exception '첫 턴을 받을 플레이어를 선택해 주세요.'; end if;
  update tichu_hands set cards=array(select x from unnest(cards)x where not x=any(p_cards)) where room_id=p_room and user_id=auth.uid(); update tichu_players set has_played=true where room_id=p_room and user_id=auth.uid();
  if cardinality(h)=cardinality(p_cards) then insert into tichu_finished values(p_room,auth.uid(),(select count(*)+1 from tichu_finished where room_id=p_room)); end if;
  if 53=any(p_cards) then
    if r.game_mode='INDIVIDUAL' then select seat into nextseat from tichu_players where room_id=p_room and user_id=p_dragon_target; else select seat into nextseat from tichu_players where room_id=p_room and team=me.team and user_id<>auth.uid(); end if;
    if not exists(select 1 from tichu_players p join tichu_hands hh using(room_id,user_id) where p.room_id=p_room and p.seat=nextseat and cardinality(hh.cards)>0) then nextseat=tichu_next_seat(p_room,nextseat); end if;
    update tichu_rooms set turn_seat=nextseat,turn_deadline=now()+make_interval(secs=>turn_seconds),lead=null,trick='[]',pass_count=0,revision=revision+1,wish_rank=coalesce(p_wish,wish_rank) where id=p_room;
  else
    nextseat=tichu_next_seat(p_room,me.seat); update tichu_rooms set turn_seat=nextseat,turn_deadline=now()+make_interval(secs=>turn_seconds),lead=p_combo,trick=trick||jsonb_build_array(jsonb_build_object('seat',me.seat,'cards',p_cards)),pass_count=0,last_trick_seat=me.seat,dragon_target=case when 55=any(p_cards) then p_dragon_target else dragon_target end,revision=revision+1,wish_rank=case when p_wish is not null then p_wish when r.wish_rank is not null and exists(select 1 from unnest(p_cards)x where x<52 and x/4+2=r.wish_rank) then null else r.wish_rank end where id=p_room;
  end if;
  select count(*) into active_count from tichu_hands where room_id=p_room and cardinality(cards)>0; if active_count<=1 then perform tichu_end_round(p_room); end if;
end $$;

create or replace function public.tichu_finish_double_out() returns trigger language plpgsql security definer set search_path=public as $$
declare double_team int;
begin
  if new.finish_order<>2 or not exists(select 1 from tichu_rooms where id=new.room_id and status='PLAYING' and game_mode='TEAM') then return new; end if;
  select p.team into double_team from tichu_finished f join tichu_players p using(room_id,user_id) where f.room_id=new.room_id and f.finish_order in(1,2) group by p.team having count(*)=2;
  if double_team is not null then perform tichu_end_round(new.room_id); end if; return new;
end $$;

create or replace function public.tichu_lobby() returns jsonb language sql stable security definer set search_path=public as $$
select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'status',r.status,'players',(select count(*) from tichu_players p where p.room_id=r.id),'spectators',(select count(*) from tichu_spectators s where s.room_id=r.id),'mine',exists(select 1 from tichu_players p where p.room_id=r.id and p.user_id=auth.uid()),'spectating',exists(select 1 from tichu_spectators s where s.room_id=r.id and s.user_id=auth.uid()),'spectators_allowed',r.spectators_allowed,'host_name',coalesce(pr.activity_name,'멤버'),'target_score',r.target_score,'turn_seconds',r.turn_seconds,'game_mode',r.game_mode) order by r.created_at desc),'[]'::jsonb) from tichu_rooms r left join profiles pr on pr.id=r.host_id where r.status<>'FINISHED' $$;

-- Preserve the current spectator-aware snapshot and expose personal scores.
do $$ declare fn text; begin
  select pg_get_functiondef('public.tichu_snapshot(uuid)'::regprocedure) into fn;
  if strpos(fn,'''finish_order'', f.finish_order')>0 then
    fn:=replace(fn,'''finish_order'', f.finish_order','''finish_order'', f.finish_order, ''score'', p.score');
  elsif strpos(fn,'''finish_order'',f.finish_order')>0 then
    fn:=replace(fn,'''finish_order'',f.finish_order','''finish_order'',f.finish_order, ''score'',p.score');
  else
    raise exception 'Tichu snapshot score insertion point not found';
  end if;
  execute fn;
end $$;

-- Bots choose the next active player for Dog and any active opponent for Dragon in individual mode.
do $$ declare fn text; begin
  select pg_get_functiondef('public.tichu_bot_tick(uuid)'::regprocedure) into fn;
  if strpos(fn,'select seat into next_seat from tichu_players where room_id=p_room and team=bot.team and user_id<>bot.user_id;')=0 then raise exception 'Tichu bot Dog insertion point not found'; end if;
  if strpos(fn,'if 55=any(play_cards) then select opp.user_id into dragon_receiver')=0 then raise exception 'Tichu bot Dragon insertion point not found'; end if;
  fn:=replace(fn,'select seat into next_seat from tichu_players where room_id=p_room and team=bot.team and user_id<>bot.user_id;','if room_row.game_mode=''INDIVIDUAL'' then next_seat:=tichu_next_seat(p_room,bot.seat); else select seat into next_seat from tichu_players where room_id=p_room and team=bot.team and user_id<>bot.user_id; end if;');
  fn:=replace(fn,'if 55=any(play_cards) then select opp.user_id into dragon_receiver from tichu_players opp where opp.room_id=p_room and opp.team<>bot.team order by (select cardinality(cards) from tichu_hands where room_id=p_room and user_id=opp.user_id),opp.seat limit 1; end if;','if 55=any(play_cards) then select opp.user_id into dragon_receiver from tichu_players opp join tichu_hands oh using(room_id,user_id) where opp.room_id=p_room and opp.user_id<>bot.user_id and cardinality(oh.cards)>0 and (room_row.game_mode=''INDIVIDUAL'' or opp.team<>bot.team) order by cardinality(oh.cards),opp.seat limit 1; end if;');
  execute fn;
end $$;

revoke all on function public.tichu_create_room(text,int,int,text) from public,anon;
grant execute on function public.tichu_create_room(text,int,int,text) to authenticated;
revoke all on function public.tichu_start_room(uuid),public.tichu_play(uuid,int[],jsonb,int,uuid),public.tichu_end_round(uuid),public.tichu_lobby() from public,anon;
grant execute on function public.tichu_start_room(uuid),public.tichu_play(uuid,int[],jsonb,int,uuid),public.tichu_end_round(uuid),public.tichu_lobby() to authenticated;

commit;
