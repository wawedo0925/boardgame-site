begin;
alter table public.site_roles drop constraint site_roles_role_check;
alter table public.site_roles add constraint site_roles_role_check check (role in ('MAIN_ADMIN','ADMIN','RULE_MASTER','MURDER_GM','MEMBER'));
alter table public.site_role_audit_log drop constraint site_role_audit_log_new_role_check;
alter table public.site_role_audit_log drop constraint if exists site_role_audit_log_old_role_check;
alter table public.site_role_audit_log add constraint site_role_audit_log_new_role_check check (new_role in ('MAIN_ADMIN','ADMIN','RULE_MASTER','MURDER_GM','MEMBER'));
alter table public.site_role_audit_log add constraint site_role_audit_log_old_role_check check (old_role in ('MAIN_ADMIN','ADMIN','RULE_MASTER','MURDER_GM','MEMBER'));
alter table public.event_participants add column gm_pending boolean not null default false;

create or replace function public.murder_has_experience(work_id uuid, member_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.murder_mystery_history where murder_mystery_id=work_id and user_id=member_id)
 or exists(select 1 from public.murder_mystery_personal_records where murder_mystery_id=work_id and user_id=member_id);
$$;
revoke all on function public.murder_has_experience(uuid,uuid) from public,anon,authenticated;

create or replace function public.event_player_count(target_id uuid)
returns integer language sql volatile security definer set search_path=public as $$
 select count(*)::integer from public.event_participants p join public.events e on e.id=p.event_id
 where p.event_id=target_id and (e.event_kind <> 'MURDER_MYSTERY' or (p.participation_role='PLAYER' and not p.gm_pending));
$$;
revoke all on function public.event_player_count(uuid) from public,anon,authenticated;

create or replace function public.validate_murder_mystery_participant()
returns trigger language plpgsql security definer set search_path=public as $$
declare e public.events%rowtype; actor_role text; member_role text; changed boolean;
begin
 select * into e from public.events where id=new.event_id for update;
 if e.event_kind <> 'MURDER_MYSTERY' then new.gm_pending:=false; return new; end if;
 if e.murder_mystery_id is null then raise exception '작품이 지정되지 않았습니다.'; end if;
 actor_role:=public.current_site_role();
 member_role:=coalesce((select role from public.site_roles where user_id=new.user_id),'MEMBER');
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then changed:=new.participation_role is distinct from old.participation_role or new.gm_pending is distinct from old.gm_pending or new.repeat_override is distinct from old.repeat_override; end if;
 if changed and e.event_status <> 'OPEN' then raise exception '종료·취소된 이벤트의 역할은 변경할 수 없습니다.'; end if;
 if new.participation_role='GM' then
   if changed and (actor_role not in ('MAIN_ADMIN','ADMIN','RULE_MASTER') or member_role not in ('MAIN_ADMIN','ADMIN','RULE_MASTER','MURDER_GM')) then raise exception '룰마 이상만 머미 GM 또는 운영진을 GM으로 지정할 수 있습니다.'; end if;
   new.gm_pending:=false;
 else
   if changed and new.repeat_override and actor_role not in ('MAIN_ADMIN','ADMIN','RULE_MASTER') then raise exception '재참가 허용은 룰마 이상만 가능합니다.'; end if;
   if changed then
     new.gm_pending:=false;
     if not new.repeat_override and public.murder_has_experience(e.murder_mystery_id,new.user_id) then
       if member_role in ('MAIN_ADMIN','ADMIN','RULE_MASTER','MURDER_GM') then new.gm_pending:=true;
       else raise exception '이미 경험한 작품입니다. 담당자의 재참가 허용이 필요합니다.'; end if;
     end if;
     if not new.gm_pending and e.max_participants is not null and
       (select count(*) from public.event_participants p where p.event_id=new.event_id and p.user_id<>new.user_id and p.participation_role='PLAYER' and not p.gm_pending)>=e.max_participants
     then raise exception '플레이어 정원이 가득 찼습니다.'; end if;
   end if;
 end if;
 return new;
end;
$$;
drop trigger validate_murder_mystery_participant_trigger on public.event_participants;
create trigger validate_murder_mystery_participant_trigger before insert or update on public.event_participants for each row execute function public.validate_murder_mystery_participant();

create or replace function public.assign_murder_mystery_member(p_event_id uuid,p_user_id uuid,p_role text,p_allow_repeat boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare e public.events%rowtype;
begin
 if auth.uid() is null or public.current_site_role() not in ('MAIN_ADMIN','ADMIN','RULE_MASTER') then raise exception '룰마 이상만 역할을 지정할 수 있습니다.'; end if;
 select * into e from public.events where id=p_event_id for update;
 if not found or e.event_kind<>'MURDER_MYSTERY' or e.event_status<>'OPEN' then raise exception '진행 가능한 머더미스터리 이벤트가 아닙니다.'; end if;
 if p_role not in ('PLAYER','GM') then raise exception '올바르지 않은 역할입니다.'; end if;
 insert into public.event_participants(event_id,user_id,participation_role,repeat_override,repeat_override_by)
 values(p_event_id,p_user_id,p_role,p_allow_repeat,case when p_allow_repeat then auth.uid() end)
 on conflict(event_id,user_id) do update set participation_role=excluded.participation_role,gm_pending=false,repeat_override=excluded.repeat_override,repeat_override_by=excluded.repeat_override_by;
 delete from public.event_waitlist where event_id=p_event_id and user_id=p_user_id;
 -- Participation as GM does not grant event operation privileges.
 delete from public.event_staff where event_id=p_event_id and user_id=p_user_id and duty='GM';
 perform public.promote_event_waitlist(p_event_id);
end;
$$;

create or replace function public.murder_mystery_event_candidates(p_event_id uuid)
returns table(user_id uuid,activity_name text,site_role text,played_before boolean)
language sql stable security definer set search_path=public as $$
 select p.id,coalesce(p.activity_name,'이름 미정'),coalesce(r.role,'MEMBER'),public.murder_has_experience(e.murder_mystery_id,p.id)
 from public.profiles p left join public.site_roles r on r.user_id=p.id join public.events e on e.id=p_event_id
 where public.current_site_role() in ('MAIN_ADMIN','ADMIN','RULE_MASTER') and e.event_kind='MURDER_MYSTERY'
 order by p.activity_name nulls last;
$$;

-- Preserve the existing notifications and other event-kind behavior.
do $$
declare s text;
begin
 s:=pg_get_functiondef('public.admin_set_member_role(uuid,text)'::regprocedure);
 s:=replace(s,'''RULE_MASTER'', ''MEMBER''','''RULE_MASTER'', ''MURDER_GM'', ''MEMBER''');
 execute s;
 s:=pg_get_functiondef('public.join_event_with_capacity(uuid)'::regprocedure);
 s:=replace(s,'select count(*) into v_count from public.event_participants where event_id=p_event_id;', 'select public.event_player_count(p_event_id) into v_count;');
 s:=replace(s,'if v_event.max_participants is null or v_count < v_event.max_participants then',
 'if v_event.event_kind = ''MURDER_MYSTERY'' and public.current_site_role() in (''MAIN_ADMIN'',''ADMIN'',''RULE_MASTER'',''MURDER_GM'') and public.murder_has_experience(v_event.murder_mystery_id,v_user) then
 delete from public.event_waitlist where event_id=p_event_id and user_id=v_user;
 insert into public.event_participants(event_id,user_id) values(p_event_id,v_user); return ''GM_PENDING''; end if;
 if v_event.max_participants is null or v_count < v_event.max_participants then');
 execute s;
 s:=pg_get_functiondef('public.promote_event_waitlist(uuid)'::regprocedure);
  s:=regexp_replace(s,'select\s+count\(\*\)\s+into\s+v_count\s+from\s+public\.event_participants\s+where\s+event_id\s*=\s*p_event_id;', 'select public.event_player_count(p_event_id) into v_count;', 'i');
 s:=replace(s,'v_count := v_count + 1;', 'v_count := public.event_player_count(p_event_id);');
 execute s;
 s:=pg_get_functiondef('public.remove_event_member(uuid,uuid)'::regprocedure);
 s:=replace(s,'order by joined_at', 'and (target.max_participants is null or public.event_player_count(p_event_id) < target.max_participants) order by joined_at');
 execute s;
 s:=pg_get_functiondef('public.snapshot_murder_mystery_history()'::regprocedure);
 s:=replace(s,'p.event_id=new.id', 'p.event_id=new.id and not p.gm_pending');
 execute s;
 s:=pg_get_functiondef('public.sync_closed_murder_event_records()'::regprocedure);
 s:=replace(s,'participant.event_id = new.id', 'participant.event_id = new.id and not participant.gm_pending');
 execute s;
end $$;

commit;
