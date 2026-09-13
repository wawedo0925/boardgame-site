begin;
create table public.clocktower_mission_settings (
 id boolean primary key default true check(id),
 questions text[] not null,
 messages text[] not null,
 updated_at timestamptz not null default now()
);
alter table public.clocktower_mission_settings enable row level security;
revoke all on public.clocktower_mission_settings from public,anon,authenticated;
grant select on public.clocktower_mission_settings to authenticated;
create policy mission_settings_admin_read on public.clocktower_mission_settings for select to authenticated using(public.is_main_admin());
insert into public.clocktower_mission_settings(id,questions,messages) values(true,
 array['누가 임프 같나요?','누가 하수인 같나요?','누가 세탁부 같나요?'],
 array['홈페이지의 머더미스터리 플레이 희망 기능을 사용해 주세요!','자신이 좋아하는 게임, 편하게 팟을 만들어 보세요!','머더미스터리 DNA 검사 해 봤나요?','보드게임 DNA 검사 해 봤나요?','진행한 게임의 평점을 남기면 게임 선택에 도움이 돼요!','정기 모임은 화·목·일입니다.','시계탑은 격주로 진행합니다.']);
create function public.clocktower_save_mission_settings(p_questions text[],p_messages text[]) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not coalesce(public.is_main_admin(),false) then raise exception '메인 관리자만 수정할 수 있습니다.';end if;
 if coalesce(cardinality(p_questions),0) not between 1 and 100 or coalesce(cardinality(p_messages),0) not between 1 and 100
 or exists(select 1 from unnest(p_questions||p_messages) t where t is null or length(trim(t)) not between 1 and 300)
 then raise exception '질문과 안내를 각각 1~100개, 문구당 1~300자로 입력해 주세요.';end if;
 update public.clocktower_mission_settings set questions=p_questions,messages=p_messages,updated_at=now() where id;
end $$;
revoke all on function public.clocktower_save_mission_settings(text[],text[]) from public,anon;
grant execute on function public.clocktower_save_mission_settings(text[],text[]) to authenticated;

alter table public.clocktower_live_missions drop constraint clocktower_live_missions_kind_check;
alter table public.clocktower_live_missions add constraint clocktower_live_missions_kind_check check(kind in ('NUMBERS','TEXT','SELECT','NOTICE'));
create function public.clocktower_mission_challenge(p_kind text) returns jsonb language plpgsql set search_path=public as $$
declare settings public.clocktower_mission_settings; phrases text[];
begin
 select * into strict settings from public.clocktower_mission_settings where id;
 phrases:=case when p_kind='SELECT' then settings.questions else settings.messages end;
 return jsonb_build_object('text',phrases[1+floor(random()*cardinality(phrases))::integer],
 'target_count',case when p_kind='SELECT' then 1 else 0 end,'delay_seconds',1+floor(random()*5)::integer);
end $$;
revoke all on function public.clocktower_mission_challenge(text) from public,anon,authenticated;
create or replace function public.clocktower_make_missions(r public.clocktower_live_rooms,n integer) returns void language plpgsql set search_path=public as $$
declare m record;k text;
begin
 if n<>1 then return;end if;
 for m in select user_id from public.clocktower_live_members where room_id=r.id loop
  k:=case when random()<0.5 then 'SELECT' else 'NOTICE' end;
  insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge,available_at)
  values(r.id,m.user_id,r.night,1,k,public.clocktower_mission_challenge(k),coalesce(r.night_started_at,clock_timestamp())+make_interval(secs=>3+random()*2)) on conflict do nothing;
 end loop;
end $$;
create or replace function public.clocktower_cover_missions() returns trigger language plpgsql set search_path=public as $$
declare m record;n integer;k text;
begin
 if not exists(select 1 from public.clocktower_live_rooms where id=new.room_id and phase='NIGHT' and night=new.night) then return new;end if;
 k:=case when new.status='RESOLVED' or new.target_count=0 then 'NOTICE' else 'SELECT' end;
 for m in select user_id from public.clocktower_live_members p where p.room_id=new.room_id and p.user_id<>new.user_id
 and not exists(select 1 from public.clocktower_live_missions where room_id=p.room_id and night=new.night and user_id=p.user_id and not completed)
 and not exists(select 1 from public.clocktower_live_requests where room_id=p.room_id and night=new.night and user_id=p.user_id and (status in ('OPEN','SUBMITTED') or (status='RESOLVED' and not acknowledged))) loop
  select coalesce(max(round),0)+1 into n from public.clocktower_live_missions where room_id=new.room_id and night=new.night and user_id=m.user_id;
  if n=1 then continue;end if;
  insert into public.clocktower_live_missions(room_id,user_id,night,round,kind,challenge,available_at)
  values(new.room_id,m.user_id,new.night,n,k,public.clocktower_mission_challenge(k),clock_timestamp()+make_interval(secs=>random()*2));
 end loop;
 return new;
end $$;
create trigger clocktower_cover_after_result after update of status on public.clocktower_live_requests for each row
 when(new.status='RESOLVED' and old.status is distinct from new.status) execute function public.clocktower_cover_missions();

-- Retain the existing ownership, current-room and current-night checks.
do $migration$
declare definition text;old_validation text;
begin
 definition:=pg_get_functiondef('public.clocktower_live_command_v5(uuid,text,jsonb)'::regprocedure);
 old_validation:=$old$if (case when m.kind='NUMBERS' then (select string_agg(tile, ',' order by tile::integer) from jsonb_array_elements_text(m.challenge->'tiles') as t(tile)) else m.challenge->>'text' end) is distinct from trim(p_data->>'answer') then raise exception '미션을 끝까지 완료해 주세요.';end if;$old$;
 if position(old_validation in definition)=0 then raise exception 'Expected mission validation was not found';end if;
 definition:=replace(definition,old_validation,$new$
 if m.available_at>clock_timestamp() then raise exception '활동 도착 후 확인해 주세요.';end if;
 if m.kind='SELECT' then
  if not exists(select 1 from public.clocktower_live_members where room_id=r.id and user_id::text=p_data->>'answer') then raise exception '참가자 한 명을 선택해 주세요.';end if;
 elsif m.kind='NOTICE' then
  if p_data->>'answer' is distinct from 'ACK' then raise exception '확인 버튼을 눌러 주세요.';end if;
 else
  if (case when m.kind='NUMBERS' then (select string_agg(tile, ',' order by tile::integer) from jsonb_array_elements_text(m.challenge->'tiles') as t(tile)) else m.challenge->>'text' end) is distinct from trim(p_data->>'answer') then raise exception '미션을 끝까지 완료해 주세요.';end if;
 end if;
 $new$);
 execute definition;
end $migration$;
-- Convert outstanding old activities without touching completed history or game results.
update public.clocktower_live_missions set kind='NOTICE',challenge=public.clocktower_mission_challenge('NOTICE') where not completed and kind in ('NUMBERS','TEXT');
commit;
