begin;

-- Additional works keep their own roster; the event's original work stays on events.
create table public.murder_event_plays (
  id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  murder_mystery_id uuid not null references public.murder_mysteries(id),
  members jsonb not null check (jsonb_typeof(members)='array'),
  cancelled boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index murder_event_plays_work on public.murder_event_plays(event_id,murder_mystery_id) where not cancelled;
alter table public.murder_event_plays enable row level security;
revoke all on public.murder_event_plays from public,anon,authenticated;
grant select on public.murder_event_plays to authenticated;
create policy "members read event works" on public.murder_event_plays for select to authenticated
using (exists(select 1 from public.events e where e.id=event_id));

-- One member can complete several distinct works in the same event.
drop index public.murder_personal_event_user_uidx;
create unique index murder_personal_event_user_work_uidx on public.murder_mystery_personal_records(event_id,user_id,murder_mystery_id) where event_id is not null;

create or replace function public.change_event_murder_work(p_event_id uuid,p_work_id uuid,p_allow_repeat boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare e public.events%rowtype;
begin
 if auth.uid() is null or not coalesce(public.current_site_role() in ('MAIN_ADMIN','ADMIN','RULE_MASTER'),false) then raise exception '룰마 이상만 작품을 변경할 수 있습니다.'; end if;
 select * into e from public.events where id=p_event_id for update;
 if not found or e.event_kind<>'MURDER_MYSTERY' or e.event_status<>'OPEN' then raise exception '진행 가능한 머더미스터리 이벤트가 아닙니다.'; end if;
 if exists(select 1 from public.murder_mystery_personal_records where event_id=p_event_id) or exists(select 1 from public.murder_mystery_history where event_id=p_event_id) then raise exception '이미 기록된 이벤트의 작품은 변경할 수 없습니다.'; end if;
 if not exists(select 1 from public.murder_mysteries where id=p_work_id) then raise exception '작품을 찾을 수 없습니다.'; end if;
 if exists(select 1 from public.murder_event_plays where event_id=p_event_id and murder_mystery_id=p_work_id and not cancelled) then raise exception '이미 추가된 작품입니다.'; end if;
 if e.murder_mystery_id=p_work_id then return; end if;
 if not coalesce(p_allow_repeat,false) and exists(select 1 from public.event_participants p where p.event_id=p_event_id and p.participation_role='PLAYER' and coalesce(p.attendance_status,'REGISTERED')<>'ABSENT' and public.murder_has_experience(p_work_id,p.user_id)) then raise exception '새 작품을 이미 경험한 플레이어가 있습니다. 명단을 확인한 뒤 재참가를 허용해 주세요.'; end if;
 update public.events set murder_mystery_id=p_work_id where id=p_event_id;
 -- Revalidate pending and repeat permissions against the new work, not the old one.
 update public.event_participants p set gm_pending=false,
 repeat_override=(coalesce(p_allow_repeat,false) and public.murder_has_experience(p_work_id,p.user_id)),
 repeat_override_by=case when coalesce(p_allow_repeat,false) and public.murder_has_experience(p_work_id,p.user_id) then auth.uid() else null end
 where p.event_id=p_event_id and p.participation_role='PLAYER' and coalesce(p.attendance_status,'REGISTERED')<>'ABSENT';
end; $$;

create or replace function public.save_event_murder_play(p_event_id uuid,p_play_id uuid,p_work_id uuid,p_members jsonb,p_allow_repeat boolean default false,p_remove boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare e public.events%rowtype; m record; normalized jsonb;
begin
 if auth.uid() is null or not coalesce(public.current_site_role() in ('MAIN_ADMIN','ADMIN','RULE_MASTER'),false) then raise exception '룰마 이상만 작품을 추가하거나 수정할 수 있습니다.'; end if;
 select * into e from public.events where id=p_event_id for update;
 if not found or e.event_kind<>'MURDER_MYSTERY' or e.event_status<>'OPEN' then raise exception '진행 가능한 머더미스터리 이벤트가 아닙니다.'; end if;
 if exists(select 1 from public.murder_mystery_personal_records where event_id=p_event_id) or exists(select 1 from public.murder_mystery_history where event_id=p_event_id) then raise exception '이미 기록된 이벤트는 수정할 수 없습니다.'; end if;
 if p_play_id is null then raise exception '추가 작품 ID가 필요합니다.'; end if;
 if exists(select 1 from public.murder_event_plays where id=p_play_id and event_id<>p_event_id) then raise exception '다른 이벤트의 작품입니다.'; end if;
 if p_remove then
   update public.murder_event_plays set cancelled=true where id=p_play_id and event_id=p_event_id;
   if not found then raise exception '추가 작품을 찾을 수 없습니다.'; end if;
   return;
 end if;
 if p_work_id is null or not exists(select 1 from public.murder_mysteries where id=p_work_id) then raise exception '작품을 찾을 수 없습니다.'; end if;
 if p_work_id=e.murder_mystery_id or exists(select 1 from public.murder_event_plays where event_id=p_event_id and murder_mystery_id=p_work_id and id<>p_play_id and not cancelled) then raise exception '이 이벤트에 이미 있는 작품입니다.'; end if;
 if p_members is null or jsonb_typeof(p_members)<>'array' then raise exception '참여 인원을 선택해 주세요.'; end if;
 if jsonb_array_length(p_members)=0 or jsonb_array_length(p_members)>100 then raise exception '참여 인원을 선택해 주세요.'; end if;
 if (select count(*) from jsonb_to_recordset(p_members) as x(user_id uuid))<>(select count(distinct user_id) from jsonb_to_recordset(p_members) as x(user_id uuid)) then raise exception '중복된 참여 인원입니다.'; end if;
 for m in select * from jsonb_to_recordset(p_members) as x(user_id uuid,role text) loop
   if m.user_id is null or m.role is null or m.role not in ('PLAYER','GM') then raise exception '참여 인원과 역할을 확인해 주세요.'; end if;
   if not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=m.user_id and coalesce(attendance_status,'REGISTERED')<>'ABSENT') then raise exception '이벤트 참가자 중 불참이 아닌 멤버만 선택할 수 있습니다.'; end if;
   if m.role='GM' and not exists(select 1 from public.site_roles where user_id=m.user_id and role in ('MAIN_ADMIN','ADMIN','RULE_MASTER','MURDER_GM')) then raise exception 'GM은 머미 GM 또는 운영진만 지정할 수 있습니다.'; end if;
   if m.role='PLAYER' and not coalesce(p_allow_repeat,false) and public.murder_has_experience(p_work_id,m.user_id) then raise exception '이미 경험한 플레이어가 있습니다. 명단을 확인한 뒤 재참가를 허용해 주세요.'; end if;
 end loop;
 if not exists(select 1 from jsonb_to_recordset(p_members) as x(role text) where role='PLAYER') then raise exception '플레이어를 한 명 이상 선택해 주세요.'; end if;
 select jsonb_agg(jsonb_build_object('user_id',x.user_id,'role',x.role) order by x.user_id) into normalized from jsonb_to_recordset(p_members) as x(user_id uuid,role text);
 insert into public.murder_event_plays(id,event_id,murder_mystery_id,members) values(p_play_id,p_event_id,p_work_id,normalized)
 on conflict(id) do update set murder_mystery_id=excluded.murder_mystery_id,members=excluded.members,cancelled=false;
end; $$;

create or replace function public.murder_event_work_candidates(p_event_id uuid,p_work_id uuid)
returns table(user_id uuid,activity_name text,site_role text,played_before boolean)
language sql stable security definer set search_path=public as $$
 select p.user_id,coalesce(f.activity_name,'이름 미정'),coalesce(r.role,'MEMBER'),public.murder_has_experience(p_work_id,p.user_id)
 from public.event_participants p join public.profiles f on f.id=p.user_id left join public.site_roles r on r.user_id=p.user_id
 where auth.uid() is not null and public.current_site_role() in ('MAIN_ADMIN','ADMIN','RULE_MASTER') and p.event_id=p_event_id
 order by f.activity_name;
$$;

create or replace function public.sync_closed_murder_event_records()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.event_kind='MURDER_MYSTERY' and new.murder_mystery_id is not null and new.event_status='CLOSED' and old.event_status is distinct from 'CLOSED' then
   insert into public.murder_mystery_personal_records(user_id,murder_mystery_id,participation_role,played_at,source,event_id)
   select p.user_id,new.murder_mystery_id,p.participation_role,(coalesce(new.ended_at,new.started_at) at time zone 'Asia/Seoul')::date,'EVENT',new.id
   from public.event_participants p where p.event_id=new.id and not p.gm_pending and coalesce(p.attendance_status,'REGISTERED')<>'ABSENT'
   on conflict(event_id,user_id,murder_mystery_id) where event_id is not null do nothing;
   insert into public.murder_mystery_personal_records(user_id,murder_mystery_id,participation_role,played_at,source,event_id)
   select m.user_id,w.murder_mystery_id,m.role,(coalesce(new.ended_at,new.started_at) at time zone 'Asia/Seoul')::date,'EVENT',new.id
   from public.murder_event_plays w cross join lateral jsonb_to_recordset(w.members) as m(user_id uuid,role text)
   join public.event_participants p on p.event_id=w.event_id and p.user_id=m.user_id
   where w.event_id=new.id and not w.cancelled and coalesce(p.attendance_status,'REGISTERED')<>'ABSENT'
   on conflict(event_id,user_id,murder_mystery_id) where event_id is not null do nothing;
 end if;
 return new;
end; $$;
revoke all on function public.change_event_murder_work(uuid,uuid,boolean),public.save_event_murder_play(uuid,uuid,uuid,jsonb,boolean,boolean),public.murder_event_work_candidates(uuid,uuid) from public,anon;
grant execute on function public.change_event_murder_work(uuid,uuid,boolean),public.save_event_murder_play(uuid,uuid,uuid,jsonb,boolean,boolean),public.murder_event_work_candidates(uuid,uuid) to authenticated;
commit;
