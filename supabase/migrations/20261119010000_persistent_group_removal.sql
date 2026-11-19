begin;

-- Keep the group and its historical rounds; omit it from current assignments.
alter table public.event_groups add column if not exists archived boolean not null default false;

create or replace function public.remove_empty_event_group(p_event_id uuid, p_group_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not coalesce(public.can_arrange_boardgame_groups(p_event_id),false) then
    raise exception '조를 삭제할 권한이 없습니다.';
  end if;
  perform 1 from public.event_groups where id=p_group_id and event_id=p_event_id for update;
  if not found then raise exception '조를 찾을 수 없습니다.'; end if;
  if exists(select 1 from public.event_group_members where group_id=p_group_id) then
    raise exception '조원을 먼저 옮기고 조 편성을 확정해 주세요.';
  end if;
  update public.event_groups set archived=true,rule_master_user_id=null where id=p_group_id;
end $$;
revoke all on function public.remove_empty_event_group(uuid,uuid) from public,anon;
grant execute on function public.remove_empty_event_group(uuid,uuid) to authenticated;

-- Lock the parent so an assignment cannot race an empty-group removal.
create or replace function public.guard_archived_group_membership()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.event_groups where id=new.group_id and not archived for update;
  if not found then raise exception '이미 정리된 조입니다. 새로고침해 주세요.'; end if;
  return new;
end $$;
revoke all on function public.guard_archived_group_membership() from public,anon,authenticated;
create trigger guard_archived_group_membership before insert or update on public.event_group_members
for each row execute function public.guard_archived_group_membership();

create or replace function public.retire_absent_default_owner_group()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_name text;
begin
  if tg_op='UPDATE' then
    if new.attendance_status is distinct from 'ABSENT' or old.attendance_status is not distinct from 'ABSENT' then return new; end if;
  end if;
  select btrim(split_part(activity_name,'/',1)) into owner_name from public.profiles where id=old.user_id;
  if owner_name in ('아라','병준') then
    update public.event_groups set archived=true,rule_master_user_id=null
    where event_id=old.event_id and not archived
      and regexp_replace(name,'\s','','g')=owner_name||'조';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.retire_absent_default_owner_group() from public,anon,authenticated;
create trigger retire_absent_default_owner_group after delete or update of attendance_status
on public.event_participants for each row execute function public.retire_absent_default_owner_group();

-- Archived membership is a historical snapshot, not a current assignment.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.apply_event_party_gm(uuid,uuid)'::regprocedure) into definition;
  definition := replace(definition,'where g.event_id=p_event_id and m.user_id=p_user_id',
    'where g.event_id=p_event_id and not g.archived and m.user_id=p_user_id');
  execute definition;
end $$;

-- Repair already-existing empty defaults whose owner is absent or has left.
update public.event_groups g set archived=true,rule_master_user_id=null
where not g.archived and regexp_replace(g.name,'\s','','g') in ('아라조','병준조')
  and not exists(select 1 from public.event_group_members m where m.group_id=g.id)
  and not exists(select 1 from public.event_participants p join public.profiles pr on pr.id=p.user_id
    where p.event_id=g.event_id and p.attendance_status<>'ABSENT'
      and btrim(split_part(pr.activity_name,'/',1))||'조'=regexp_replace(g.name,'\s','','g'));
commit;
