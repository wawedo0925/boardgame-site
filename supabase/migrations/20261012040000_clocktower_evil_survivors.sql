begin;
alter table public.clocktower_live_rooms add column evil_survivors_dismissed text;

-- Private suggestion, never an additional automatic victory rule.
create function public.clocktower_evil_survivors_key(p_room uuid) returns text
language plpgsql stable set search_path=public as $$
declare r public.clocktower_live_rooms; n integer; all_evil boolean; demon boolean; roster text;
begin
 select * into r from public.clocktower_live_rooms where id=p_room;
 if r.phase not in ('DAY','NIGHT') or r.winner is not null then return null;end if;
 if r.phase='NIGHT' and not coalesce(case when r.script='BMR' then (r.bmr_state->>'completed')::boolean else (r.night_engine->>'finished')::boolean end,false) then return null;end if;
 if exists(select 1 from public.clocktower_live_votes where room_id=r.id and status in ('WAITING','RUNNING')) then return null;end if;
 if r.script='BMR' and (r.bmr_state->'auto'?'pending' or r.bmr_state->'auto'?'waiting' or r.bmr_state->'auto'?'mastermind') then return null;end if;
 select count(*),bool_and(case when r.script='BMR' then coalesce(m.bmr->>'faction','')='EVIL' else coalesce(m.actual_role,'') in ('임프','독살범','첩자','남작','탕녀') end),
 bool_or(case when r.script='BMR' then m.actual_role in ('좀비얼','푸카','샤발로스','포') else m.actual_role='임프' end),
 string_agg(m.user_id::text||':'||coalesce(m.actual_role,'')||':'||coalesce(m.bmr->>'faction',''),',' order by m.user_id)
 into n,all_evil,demon,roster from public.clocktower_live_members m
 where m.room_id=r.id and (case when r.script='BMR' then coalesce(m.bmr->>'life','') in ('ALIVE','ZOMBIE') else m.alive end);
 if n<3 or not coalesce(all_evil,false) or not coalesce(demon,false) then return null;end if;
 return md5(r.id::text||':'||r.night::text||':'||r.phase||':'||roster);
end $$;
revoke all on function public.clocktower_evil_survivors_key(uuid) from public,anon,authenticated;

alter function public.clocktower_live_snapshot(uuid) rename to clocktower_live_snapshot_before_evil_survivors;
revoke all on function public.clocktower_live_snapshot_before_evil_survivors(uuid) from public,anon,authenticated;
create function public.clocktower_live_snapshot(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s jsonb; k text; dismissed text;
begin
 s:=public.clocktower_live_snapshot_before_evil_survivors(p_event_id);
 if coalesce((s->>'is_host')::boolean,false) then
  k:=public.clocktower_evil_survivors_key((s->'room'->>'id')::uuid);
  select evil_survivors_dismissed into dismissed from public.clocktower_live_rooms where id=(s->'room'->>'id')::uuid;
  s:=s||jsonb_build_object('evil_survivors',case when k is distinct from dismissed then k else null end);
 end if;
 return s;
end $$;
grant execute on function public.clocktower_live_snapshot(uuid) to authenticated;
revoke all on function public.clocktower_live_snapshot(uuid) from public,anon;

alter function public.clocktower_live_command(uuid,text,jsonb) rename to clocktower_live_command_before_evil_survivors;
revoke all on function public.clocktower_live_command_before_evil_survivors(uuid,text,jsonb) from public,anon,authenticated;
create function public.clocktower_live_command(p_event_id uuid,p_action text,p_data jsonb default '{}') returns void
language plpgsql security definer set search_path=public as $$
declare r public.clocktower_live_rooms; k text;
begin
 if p_action not in ('evil_survivors_continue','evil_survivors_end') then
  perform public.clocktower_live_command_before_evil_survivors(p_event_id,p_action,p_data);return;
 end if;
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
 select * into r from public.clocktower_live_rooms where event_id=p_event_id order by created_at desc,id desc limit 1 for update;
 if r.id is null or r.storyteller_id is distinct from auth.uid() or r.id::text is distinct from p_data->>'room_id' then raise exception '현재 방의 이야기꾼만 승리를 확정할 수 있습니다.';end if;
 k:=public.clocktower_evil_survivors_key(r.id);
 if k is null or k is distinct from p_data->>'key' then raise exception '생존자 또는 진행 상태가 바뀌었습니다. 최신 화면에서 확인해 주세요.';end if;
 if p_action='evil_survivors_continue' then
  update public.clocktower_live_rooms set evil_survivors_dismissed=k where id=r.id;
 else
  perform public.clocktower_end_game(r.id,'EVIL','악 팀만 생존하여 이야기꾼이 악 팀 승리를 확정했습니다.');
  insert into public.clocktower_recap_entries(room_id,night,phase,title,details) values(r.id,r.night,r.phase,'이야기꾼 승리 판정','["악 팀만 생존 · 이야기꾼 확인으로 악 팀 승리"]');
 end if;
end $$;
revoke all on function public.clocktower_live_command(uuid,text,jsonb) from public,anon;
grant execute on function public.clocktower_live_command(uuid,text,jsonb) to authenticated;
commit;
