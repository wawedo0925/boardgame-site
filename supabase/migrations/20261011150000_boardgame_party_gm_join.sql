begin;

-- Private intent survives waitlisting. Only the self-service join RPC can set it.
create table public.event_party_gm_requests (
 event_id uuid not null references public.events(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 group_id uuid references public.event_groups(id) on delete set null,
 primary key(event_id,user_id)
);
alter table public.event_party_gm_requests enable row level security;
revoke all on public.event_party_gm_requests from public,anon,authenticated;

create function public.apply_event_party_gm(p_event_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare chosen_group uuid; member_name text;
begin
 perform 1 from public.events where id=p_event_id and event_kind='BOARDGAME' for update;
 if not found then return; end if;
 select group_id into chosen_group from public.event_party_gm_requests where event_id=p_event_id and user_id=p_user_id for update;
 if not found or chosen_group is not null or not exists(select 1 from public.event_participants where event_id=p_event_id and user_id=p_user_id) then return; end if;
 -- Never move someone out of a group already assigned by an operator.
 if exists(select 1 from public.event_group_members m join public.event_groups g on g.id=m.group_id where g.event_id=p_event_id and m.user_id=p_user_id) then
  raise exception '이미 배정된 조가 있습니다. 운영진에게 조 변경을 요청해 주세요.';
 end if;
 select coalesce(nullif(btrim(split_part(activity_name,'/',1)),''),'회원') into member_name from public.profiles where id=p_user_id;
 insert into public.event_groups(event_id,name,position,rule_master_user_id,created_by)
 values(p_event_id,coalesce(member_name,'회원')||' 조',(select coalesce(max(position),-1)+1 from public.event_groups where event_id=p_event_id),p_user_id,p_user_id)
 returning id into chosen_group;
 insert into public.event_group_members(group_id,user_id,position) values(chosen_group,p_user_id,0);
 update public.event_participants set game_preference='PREMADE_PARTY',game_preference_updated_at=clock_timestamp() where event_id=p_event_id and user_id=p_user_id;
 update public.event_party_gm_requests set group_id=chosen_group where event_id=p_event_id and user_id=p_user_id;
end $$;
revoke all on function public.apply_event_party_gm(uuid,uuid) from public,anon,authenticated;

create function public.event_party_gm_participation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' then
  perform public.apply_event_party_gm(new.event_id,new.user_id);
  return new;
 end if;
 if tg_table_name='event_participants' or not exists(select 1 from public.event_participants where event_id=old.event_id and user_id=old.user_id) then
  if tg_table_name='event_participants' then
   update public.event_groups set rule_master_user_id=null where rule_master_user_id=old.user_id and id in (select group_id from public.event_party_gm_requests where event_id=old.event_id and user_id=old.user_id);
   delete from public.event_group_members where user_id=old.user_id and group_id in (select group_id from public.event_party_gm_requests where event_id=old.event_id and user_id=old.user_id);
  end if;
  delete from public.event_party_gm_requests where event_id=old.event_id and user_id=old.user_id;
 end if;
 return old;
end $$;
revoke all on function public.event_party_gm_participation() from public,anon,authenticated;
create trigger event_party_gm_joined after insert or delete on public.event_participants for each row execute function public.event_party_gm_participation();
-- Promotion may delete the waitlist row either before or after inserting participation.
create constraint trigger event_party_gm_wait_cancelled after delete on public.event_waitlist deferrable initially deferred for each row execute function public.event_party_gm_participation();

create function public.join_event_party_gm(p_event_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); result text;
begin
 if u is null then raise exception '로그인이 필요합니다.'; end if;
 perform 1 from public.events where id=p_event_id and event_kind='BOARDGAME' for update;
 if not found then raise exception '보드게임 이벤트에서만 신청할 수 있습니다.'; end if;
 insert into public.event_party_gm_requests(event_id,user_id) values(p_event_id,u) on conflict do nothing;
 result:=public.join_event_with_arrival(p_event_id,null,'NORMAL');
 if result='JOINED' then perform public.apply_event_party_gm(p_event_id,u); end if;
 return result;
end $$;
revoke all on function public.join_event_party_gm(uuid) from public,anon;
grant execute on function public.join_event_party_gm(uuid) to authenticated;
commit;
