begin;

alter table public.tichu_players drop constraint if exists tichu_players_user_id_fkey;
alter table public.tichu_hands drop constraint if exists tichu_hands_user_id_fkey;
alter table public.tichu_exchanges drop constraint if exists tichu_exchanges_user_id_fkey;
alter table public.tichu_finished drop constraint if exists tichu_finished_user_id_fkey;
alter table public.tichu_received_cards drop constraint if exists tichu_received_cards_user_id_fkey;
alter table public.tichu_received_cards drop constraint if exists tichu_received_cards_from_user_id_fkey;

alter table public.tichu_players
  add column if not exists is_bot boolean not null default false,
  add column if not exists bot_name text;

create or replace function public.tichu_add_bot(p_room uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare room_row tichu_rooms%rowtype; bot_id uuid:=gen_random_uuid(); open_seat int; bot_team int; bot_number int;
begin
  select * into room_row from tichu_rooms where id=p_room for update;
  if room_row.host_id<>auth.uid() or room_row.status<>'WAITING' then raise exception '방장만 대기방에서 AI를 추가할 수 있습니다.'; end if;
  if (select count(*) from tichu_players where room_id=p_room)>=4 then raise exception '빈자리가 없습니다.'; end if;
  select x into open_seat from generate_series(0,3)x where not exists(select 1 from tichu_players where room_id=p_room and seat=x) order by x limit 1;
  select case when count(*) filter(where team=0)<=count(*) filter(where team=1) then 0 else 1 end into bot_team from tichu_players where room_id=p_room;
  if (select count(*) from tichu_players where room_id=p_room and team=bot_team)>=2 then bot_team:=1-bot_team; end if;
  select count(*)+1 into bot_number from tichu_players where room_id=p_room and is_bot;
  insert into tichu_players(room_id,user_id,seat,team,ready,is_bot,bot_name)
  values(p_room,bot_id,open_seat,bot_team,true,true,'연습 AI '||bot_number);
  update tichu_rooms set revision=revision+1,updated_at=now() where id=p_room;
  return bot_id;
end $$;

create or replace function public.tichu_remove_bot(p_room uuid,p_bot uuid) returns void
language plpgsql security definer set search_path=public as $$
declare room_row tichu_rooms%rowtype;
begin
  select * into room_row from tichu_rooms where id=p_room for update;
  if room_row.host_id<>auth.uid() or room_row.status<>'WAITING' then raise exception '방장만 대기방에서 AI를 제거할 수 있습니다.'; end if;
  delete from tichu_players where room_id=p_room and user_id=p_bot and is_bot;
  if not found then raise exception 'AI 참가자를 찾을 수 없습니다.'; end if;
  update tichu_rooms set revision=revision+1,updated_at=now() where id=p_room;
end $$;

create or replace function public.tichu_bot_tick(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare
  room_row tichu_rooms%rowtype; bot tichu_players%rowtype; target tichu_players%rowtype;
  deck int[]; used int[]; hand_cards int[]; chosen int[]:='{}'; gifts jsonb:='{}'; gift_card int;
  play_card int; play_strength numeric; lead_strength numeric; next_seat int; active_count int; winner int;
  dragon_receiver uuid; has_wish boolean:=false; wish_legal boolean:=false; i int:=1; changed int:=0;
begin
  perform tichu_assert_member(p_room);
  select * into room_row from tichu_rooms where id=p_room for update;

  if room_row.status='GRAND' then
    update tichu_players set grand_choice=false where room_id=p_room and is_bot and grand_choice is null;
    get diagnostics changed = row_count;
    if (select count(*) from tichu_players where room_id=p_room and grand_choice is not null)=4 then
      select coalesce(array_agg(x),'{}') into used from tichu_hands h cross join unnest(h.cards)x where h.room_id=p_room;
      select array_agg(x order by random()) into deck from generate_series(0,55)x where not x=any(used);
      for bot in select * from tichu_players where room_id=p_room loop
        update tichu_hands set cards=cards||(select array_agg(deck[j]) from generate_series(bot.seat*6+1,bot.seat*6+6)j) where room_id=p_room and user_id=bot.user_id;
      end loop;
      update tichu_rooms set status='EXCHANGE',revision=revision+1,updated_at=now() where id=p_room;
    elsif changed>0 then update tichu_rooms set revision=revision+1 where id=p_room; end if;
    return;
  end if;

  if room_row.status='EXCHANGE' then
    for bot in select * from tichu_players p where p.room_id=p_room and p.is_bot and not exists(select 1 from tichu_exchanges e where e.room_id=p.room_id and e.user_id=p.user_id and (select count(*) from jsonb_object_keys(e.gifts))=3) loop
      select array_agg(c order by case when c<52 then c/4+2 when c=52 then 1 when c=53 then 16 when c=54 then 14 else 15 end,c) into hand_cards from unnest((select cards from tichu_hands where room_id=p_room and user_id=bot.user_id))c;
      chosen:='{}'; gifts:='{}'; i:=1;
      for target in select * from tichu_players where room_id=p_room and user_id<>bot.user_id order by seat loop
        gift_card:=hand_cards[i]; chosen:=array_append(chosen,gift_card); gifts:=gifts||jsonb_build_object(target.user_id::text,gift_card); i:=i+1;
      end loop;
      insert into tichu_exchanges(room_id,user_id,cards,gifts) values(p_room,bot.user_id,chosen,gifts)
      on conflict(room_id,user_id) do update set cards=excluded.cards,gifts=excluded.gifts;
      changed:=changed+1;
    end loop;
    if (select count(*) from tichu_exchanges e where room_id=p_room and (select count(*) from jsonb_object_keys(e.gifts))=3)=4 then
      perform tichu_finish_exchange(p_room);
    elsif changed>0 then update tichu_rooms set revision=revision+1 where id=p_room; end if;
    return;
  end if;

  if room_row.status<>'PLAYING' then return; end if;
  select * into bot from tichu_players where room_id=p_room and seat=room_row.turn_seat and is_bot;
  if not found then return; end if;
  select cards into hand_cards from tichu_hands where room_id=p_room and user_id=bot.user_id;
  lead_strength:=coalesce((room_row.lead->>'strength')::numeric,0);
  if room_row.wish_rank is not null then
    has_wish:=exists(select 1 from unnest(hand_cards)c where c<52 and c/4+2=room_row.wish_rank);
    wish_legal:=room_row.lead is null or ((room_row.lead->>'kind')='single' and room_row.wish_rank>lead_strength);
  end if;

  if room_row.lead is null then
    if room_row.wish_rank is not null and has_wish then select min(c) into play_card from unnest(hand_cards)c where c<52 and c/4+2=room_row.wish_rank;
    elsif 52=any(hand_cards) then play_card:=52;
    else select c into play_card from unnest(hand_cards)c where c<52 order by c/4+2,c limit 1;
      if play_card is null and 53=any(hand_cards) then play_card:=53; end if;
      if play_card is null and 54=any(hand_cards) then play_card:=54; end if;
      if play_card is null and 55=any(hand_cards) then play_card:=55; end if;
    end if;
  elsif (room_row.lead->>'kind')='single' then
    if has_wish and wish_legal then select min(c) into play_card from unnest(hand_cards)c where c<52 and c/4+2=room_row.wish_rank and c/4+2>lead_strength;
    elsif not has_wish then
      select c into play_card from unnest(hand_cards)c where c<52 and c/4+2>lead_strength order by c/4+2,c limit 1;
      if play_card is null and 54=any(hand_cards) and lead_strength<14.5 then play_card:=54; end if;
      if play_card is null and 55=any(hand_cards) and lead_strength<15 then play_card:=55; end if;
    end if;
  end if;

  if play_card is null then
    select count(*) into active_count from tichu_hands where room_id=p_room and cardinality(cards)>0;
    if room_row.lead is null then update tichu_rooms set turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1 where id=p_room; return; end if;
    if room_row.pass_count>=greatest(active_count-2,0) then
      winner:=room_row.last_trick_seat;
      update tichu_players set captured=captured||(select coalesce(array_agg(c::int),'{}') from jsonb_array_elements(room_row.trick)t cross join jsonb_array_elements_text(t->'cards')c) where room_id=p_room and (case when room_row.dragon_target is not null then user_id=room_row.dragon_target else seat=winner end);
      if not exists(select 1 from tichu_players p join tichu_hands h using(room_id,user_id) where p.room_id=p_room and p.seat=winner and cardinality(h.cards)>0) then winner=tichu_next_seat(p_room,winner); end if;
      update tichu_rooms set turn_seat=winner,lead=null,trick='[]',pass_count=0,dragon_target=null,turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1 where id=p_room;
    else update tichu_rooms set turn_seat=tichu_next_seat(p_room,bot.seat),pass_count=pass_count+1,turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1 where id=p_room; end if;
    return;
  end if;

  update tichu_hands set cards=array_remove(cards,play_card) where room_id=p_room and user_id=bot.user_id;
  update tichu_players set has_played=true where room_id=p_room and user_id=bot.user_id;
  if cardinality(hand_cards)=1 then insert into tichu_finished values(p_room,bot.user_id,(select count(*)+1 from tichu_finished where room_id=p_room)); end if;

  if play_card=53 then
    select seat into next_seat from tichu_players where room_id=p_room and team=bot.team and user_id<>bot.user_id;
    if not exists(select 1 from tichu_players p join tichu_hands h using(room_id,user_id) where p.room_id=p_room and p.seat=next_seat and cardinality(h.cards)>0) then next_seat=tichu_next_seat(p_room,next_seat); end if;
    update tichu_rooms set turn_seat=next_seat,lead=null,trick='[]',pass_count=0,turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1 where id=p_room;
  else
    play_strength:=case when play_card<52 then play_card/4+2 when play_card=52 then 1 when play_card=54 then case when room_row.lead is null then 1.5 else least(14.5,lead_strength+.5) end else 15 end;
    if play_card=55 then select user_id into dragon_receiver from tichu_players where room_id=p_room and team<>bot.team order by seat limit 1; end if;
    next_seat:=tichu_next_seat(p_room,bot.seat);
    update tichu_rooms set turn_seat=next_seat,lead=jsonb_build_object('kind','single','size',1,'strength',play_strength,'bomb',false),trick=trick||jsonb_build_array(jsonb_build_object('seat',bot.seat,'cards',jsonb_build_array(play_card))),pass_count=0,last_trick_seat=bot.seat,dragon_target=case when play_card=55 then dragon_receiver else dragon_target end,turn_deadline=now()+make_interval(secs=>turn_seconds),revision=revision+1,wish_rank=case when play_card=52 then 2 when room_row.wish_rank is not null and play_card<52 and play_card/4+2=room_row.wish_rank then null else room_row.wish_rank end where id=p_room;
  end if;
  select count(*) into active_count from tichu_hands where room_id=p_room and cardinality(cards)>0;
  if active_count<=1 then perform tichu_end_round(p_room); end if;
end $$;

create or replace function public.tichu_snapshot(p_room uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'room',to_jsonb(r),
  'me',jsonb_build_object('user_id',auth.uid(),'seat',me.seat,'team',me.team,'cards',coalesce(h.cards,'{}'),'ready',me.ready,'grand_choice',me.grand_choice,'grand_called',me.grand_called,'small_called',me.small_called,'has_played',me.has_played),
  'players',coalesce((select jsonb_agg(jsonb_build_object(
    'user_id',p.user_id,'seat',p.seat,'team',p.team,'name',case when p.is_bot then p.bot_name else coalesce(pr.activity_name,'멤버') end,'gender',pr.gender,'is_bot',p.is_bot,
    'avatar',case when p.is_bot then (p.seat+8)%16 else coalesce(pr.tichu_avatar,0) end,'skin',coalesce(pr.tichu_skin,1),'hairColor',case when p.is_bot then (p.seat+1)%8 else coalesce(pr.tichu_hair_color,0) end,
    'expression',case when p.is_bot then 2 else coalesce(pr.tichu_expression,0) end,'outfit',coalesce(pr.tichu_outfit,0),'accessory',coalesce(pr.tichu_accessory,0),'frame',coalesce(pr.tichu_frame,0),
    'count',coalesce(cardinality(hh.cards),0),'ready',p.ready,'grand_choice',p.grand_choice,'grand_called',p.grand_called,'small_called',p.small_called,'finish_order',f.finish_order
  ) order by p.seat) from tichu_players p left join profiles pr on pr.id=p.user_id left join tichu_hands hh using(room_id,user_id) left join tichu_finished f using(room_id,user_id) where p.room_id=r.id),'[]'::jsonb),
  'exchange_count',(select count(*) from tichu_exchanges e where room_id=r.id and (select count(*) from jsonb_object_keys(e.gifts))=3),
  'my_gifts',coalesce((select gifts from tichu_exchanges where room_id=r.id and user_id=auth.uid()),'{}'::jsonb),
  'received',coalesce((select jsonb_agg(jsonb_build_object('card',x.card,'from_user_id',x.from_user_id,'from_name',case when fp.is_bot then fp.bot_name else coalesce(pr.activity_name,'멤버') end)) from tichu_received_cards x left join profiles pr on pr.id=x.from_user_id left join tichu_players fp on fp.room_id=x.room_id and fp.user_id=x.from_user_id where x.room_id=r.id and x.user_id=auth.uid()),'[]'::jsonb)
 ) from tichu_rooms r join tichu_players me on me.room_id=r.id and me.user_id=auth.uid() left join tichu_hands h on h.room_id=r.id and h.user_id=auth.uid() where r.id=p_room;
$$;

revoke all on function public.tichu_add_bot(uuid),public.tichu_remove_bot(uuid,uuid),public.tichu_bot_tick(uuid) from public,anon;
grant execute on function public.tichu_add_bot(uuid),public.tichu_remove_bot(uuid,uuid),public.tichu_bot_tick(uuid) to authenticated;
revoke all on function public.tichu_snapshot(uuid) from public,anon;
grant execute on function public.tichu_snapshot(uuid) to authenticated;

commit;
