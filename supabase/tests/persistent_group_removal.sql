-- All fixtures, participant changes and notifications roll back.
begin;
do $$
declare
  e uuid; empty_group uuid; ara_group uuid; other_group uuid; byeong_group uuid;
  owner_id uuid := '330488c9-cce1-4758-a70a-3ff63b676ea8';
  ara uuid; byeong uuid; denied boolean := false;
begin
  select id into strict ara from public.profiles where btrim(split_part(activity_name,'/',1))='아라' limit 1;
  select id into strict byeong from public.profiles where btrim(split_part(activity_name,'/',1))='병준' limit 1;
  insert into public.events(title,started_at,event_kind,created_by)
    values('group cleanup test','2027-02-05 19:20+09','BOARDGAME',owner_id) returning id into e;
  insert into public.event_participants(event_id,user_id,attendance_status) values(e,ara,'PRESENT'),(e,byeong,'PRESENT');
  insert into public.event_groups(event_id,name,position,created_by) values(e,'빈 조',0,owner_id) returning id into empty_group;
  insert into public.event_groups(event_id,name,position,created_by) values(e,'아라 조',1,owner_id) returning id into ara_group;
  insert into public.event_groups(event_id,name,position,created_by) values(e,'병준 조',2,owner_id) returning id into byeong_group;
  insert into public.event_groups(event_id,name,position,created_by) values(e,'다른 조',3,owner_id) returning id into other_group;
  insert into public.event_group_members(group_id,user_id,position) values(ara_group,ara,0),(ara_group,owner_id,1),(byeong_group,byeong,0);
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.remove_empty_event_group(e,empty_group); exception when others then denied := true; end;
  if not denied then raise exception 'Anonymous deletion allowed'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.remove_empty_event_group(e,empty_group);
  if not (select archived from public.event_groups where id=empty_group) then raise exception 'Empty deletion not persisted'; end if;
  denied := false;
  begin perform public.remove_empty_event_group(e,ara_group); exception when others then denied := true; end;
  if not denied then raise exception 'Occupied deletion allowed'; end if;
  denied := false;
  begin insert into public.event_group_members(group_id,user_id,position) values(empty_group,owner_id,0); exception when others then denied := true; end;
  if not denied then raise exception 'Archived group accepted assignment'; end if;
  update public.event_participants set attendance_status='ABSENT' where event_id=e and user_id=ara;
  if not (select archived from public.event_groups where id=ara_group) then raise exception 'Absence cleanup failed'; end if;
  if not exists(select 1 from public.event_group_members where group_id=ara_group and user_id=owner_id) then raise exception 'Historical snapshot lost'; end if;
  delete from public.event_participants where event_id=e and user_id=byeong;
  if not (select archived from public.event_groups where id=byeong_group) then raise exception 'Leave cleanup failed'; end if;
  if (select archived from public.event_groups where id=other_group) then raise exception 'Unrelated group affected'; end if;
  update public.event_participants set attendance_status='PRESENT' where event_id=e and user_id=ara;
  if not (select archived from public.event_groups where id=ara_group) then raise exception 'Archived group resurrected'; end if;
end $$;
rollback;
select 'PASS: persistent removal, permissions, occupied guard, absence, leave, no resurrection' as validation;
