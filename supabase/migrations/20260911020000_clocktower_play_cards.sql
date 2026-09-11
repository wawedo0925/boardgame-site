begin;
-- Each new room must sort after the previous one, even inside one transaction.
alter table public.clocktower_live_rooms alter column created_at set default clock_timestamp();
-- A preparation card is not a play-history record. Results are linked only on completion.
create table public.clocktower_event_plays (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete cascade,
 play_number integer not null check(play_number>0),
 room_id uuid unique references public.clocktower_live_rooms(id) on delete set null,
 result_round_id uuid unique references public.event_game_rounds(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(event_id,play_number)
);
alter table public.clocktower_event_plays enable row level security;
revoke all on public.clocktower_event_plays from anon,authenticated;

-- Preserve existing program games and manual records, without copying result rows.
insert into public.clocktower_event_plays(event_id,play_number,room_id,result_round_id,created_at)
select event_id,row_number() over(partition by event_id order by created_at,id),id,result_round_id,created_at
from public.clocktower_live_rooms;
do $$ declare x record; begin
 for x in select s.event_id,r.id,r.created_at from public.event_game_rounds r
 join public.event_game_sessions s on s.id=r.session_id join public.games g on g.id=s.game_id
 join public.events e on e.id=s.event_id
 where e.event_kind='CLOCKTOWER' and g.name ilike '%시계탑에 흐른 피%'
 and not exists(select 1 from public.clocktower_event_plays p where p.result_round_id=r.id)
 order by r.created_at,r.round_number loop
 insert into public.clocktower_event_plays(event_id,play_number,result_round_id,created_at)
 select x.event_id,coalesce(max(play_number),0)+1,x.id,x.created_at from public.clocktower_event_plays where event_id=x.event_id;
 end loop;
end $$;

create function public.clocktower_link_play_result() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 update public.clocktower_event_plays set result_round_id=new.result_round_id where room_id=new.id;
 return new;
end $$;
revoke all on function public.clocktower_link_play_result() from public,anon,authenticated;
create trigger clocktower_link_play_result after update of result_round_id on public.clocktower_live_rooms
for each row execute function public.clocktower_link_play_result();

create function public.clocktower_event_plays_command(p_event_id uuid,p_action text default 'list',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.clocktower_event_plays; last_play public.clocktower_event_plays;
 operator boolean; rid uuid; sid uuid; gid uuid; seq integer; a jsonb; uid uuid; kind text; faction text; character text;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 operator:=coalesce(public.can_operate_event(p_event_id),false);
 if not operator and not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=auth.uid()) then
  raise exception '일정 참가자만 입장할 수 있습니다.';
 end if;
 if not exists(select 1 from public.events where id=p_event_id and event_kind='CLOCKTOWER') then raise exception '시계탑 일정이 아닙니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 -- Include rooms created by older clients as well.
 for rid in select r.id from public.clocktower_live_rooms r where r.event_id=p_event_id
  and not exists(select 1 from public.clocktower_event_plays cp where cp.room_id=r.id) order by r.created_at,r.id loop
  insert into public.clocktower_event_plays(event_id,play_number,room_id,result_round_id)
  select p_event_id,coalesce((select max(play_number) from public.clocktower_event_plays where event_id=p_event_id),0)+1,r.id,r.result_round_id
  from public.clocktower_live_rooms r where r.id=rid;
 end loop;
 select * into last_play from public.clocktower_event_plays where event_id=p_event_id order by play_number desc limit 1;
 if p_action<>'list' and not operator then raise exception '이야기꾼만 변경할 수 있습니다.';end if;
 if p_action<>'list' and not exists(select 1 from public.events where id=p_event_id and event_status='OPEN') then raise exception '마감된 일정입니다.';end if;
 if p_action='add' then
  -- Expected previous card makes double-clicks and retries idempotent.
  if last_play.id is not null and last_play.id::text is distinct from p_data->>'after_id' then return jsonb_build_object('id',last_play.id);end if;
  if last_play.id is not null and last_play.result_round_id is null and not exists(select 1 from public.clocktower_live_rooms where id=last_play.room_id and phase='ENDED') then raise exception '현재 판을 먼저 마쳐 주세요.';end if;
  if exists(select 1 from public.clocktower_live_rooms where event_id=p_event_id and phase<>'ENDED') then raise exception '진행 중인 판이 있습니다.';end if;
  insert into public.clocktower_event_plays(event_id,play_number) values(p_event_id,coalesce(last_play.play_number,0)+1) returning id into rid;
  return jsonb_build_object('id',rid);
 elsif p_action in ('open','save') then
  select * into p from public.clocktower_event_plays where id=(p_data->>'play_id')::uuid and event_id=p_event_id for update;
  if p.id is null then raise exception '판을 찾지 못했습니다.';end if;
  if p_action='open' then
   if p.result_round_id is not null or p.id<>last_play.id then raise exception '완료된 판입니다. 새 판에서 입장해 주세요.';end if;
   if p.room_id is null then
    perform public.clocktower_live_command(p_event_id,'create','{}');
    select id into rid from public.clocktower_live_rooms where event_id=p_event_id and phase<>'ENDED';
    update public.clocktower_event_plays set room_id=rid where id=p.id;
   else
    rid:=p.room_id;
    if exists(select 1 from public.clocktower_live_rooms where id=rid and phase='ENDED') then raise exception '종료된 판입니다. 한판 더를 눌러 주세요.';end if;
   end if;
   return jsonb_build_object('room_id',rid);
  end if;
  if p.room_id is not null and exists(select 1 from public.clocktower_live_rooms where id=p.room_id and (phase<>'ENDED' or winner is not null)) then raise exception '프로그램의 결과는 승패 확정 시 자동 저장됩니다.';end if;
  if coalesce(p_data->>'winning_faction','') not in ('선','악') then raise exception '승리 진영을 선택해 주세요.';end if;
  if jsonb_typeof(p_data->'assignments') is distinct from 'array' or jsonb_array_length(p_data->'assignments')=0 then raise exception '참가자의 캐릭터를 입력해 주세요.';end if;
  select id into gid from public.games where name ilike '%시계탑에 흐른 피%' order by name,id limit 1;
  if gid is null then raise exception '시계탑 게임을 찾지 못했습니다.';end if;
  select id into sid from public.event_game_sessions where event_id=p_event_id and game_id=gid order by created_at,id limit 1;
  if sid is null then insert into public.event_game_sessions(event_id,game_id,result_type,created_by) values(p_event_id,gid,'ROLE',auth.uid()) returning id into sid;end if;
  rid:=p.result_round_id;
  if rid is null then
   select coalesce(max(round_number),0)+1 into seq from public.event_game_rounds where session_id=sid;
   insert into public.event_game_rounds(session_id,round_number,created_by) values(sid,seq,auth.uid()) returning id into rid;
  end if;
  delete from public.event_round_players where round_id=rid;
  for a in select * from jsonb_array_elements(p_data->'assignments') loop
   uid:=(a->>'user_id')::uuid;kind:=a->>'character_type';faction:=a->>'faction';character:=nullif(trim(a->>'character_name'),'');
   if character is null or coalesce(kind,'') not in ('이야기꾼','주민','외지인','하수인','악마') or faction is distinct from (case when kind='이야기꾼' then '중립' when kind in ('하수인','악마') then '악' else '선' end) then raise exception '캐릭터 정보를 확인해 주세요.';end if;
   if not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=uid) then raise exception '일정 참가자만 기록할 수 있습니다.';end if;
   insert into public.event_round_players(round_id,user_id,role_name,team_name,is_winner,is_gm,updated_at)
   values(rid,uid,case when kind<>'이야기꾼' then character end,case when kind<>'이야기꾼' then concat(p_data->>'difficulty',' · ',kind,' · ',faction) end,
    case when kind<>'이야기꾼' then faction=p_data->>'winning_faction' end,kind='이야기꾼',now());
  end loop;
  update public.clocktower_event_plays set result_round_id=rid where id=p.id;
  return jsonb_build_object('result_round_id',rid);
 elsif p_action<>'list' then raise exception '지원하지 않는 작업입니다.';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',cp.id,'play_number',cp.play_number,'room_id',cp.room_id,'result_round_id',cp.result_round_id,
  'phase',r.phase,'winner',r.winner,'automatic',r.result_round_id is not null,
  'players',coalesce((select jsonb_agg(jsonb_build_object('user_id',rp.user_id,'name',coalesce(pr.activity_name,'회원'),'role_name',rp.role_name,'team_name',rp.team_name,'is_winner',rp.is_winner,'is_gm',rp.is_gm) order by rp.is_winner desc nulls last,pr.activity_name)
   from public.event_round_players rp left join public.profiles pr on pr.id=rp.user_id where rp.round_id=cp.result_round_id),'[]'::jsonb)) order by cp.play_number)
  from public.clocktower_event_plays cp left join public.clocktower_live_rooms r on r.id=cp.room_id where cp.event_id=p_event_id),'[]'::jsonb);
end $$;
revoke all on function public.clocktower_event_plays_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_event_plays_command(uuid,text,jsonb) to authenticated;
commit;
