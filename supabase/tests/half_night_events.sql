-- Run as database owner. All fixtures, notifications, and counter changes roll back.
begin;
do $$
declare
  a uuid; b uuid; baseline integer; actual public.events%rowtype;
  owner_id uuid := '330488c9-cce1-4758-a70a-3ff63b676ea8';
  u1 uuid := '1c5b8c15-ec79-4b88-831e-7c26d4085f69';
  u2 uuid := '4da4c54c-30ac-4082-b5c5-dd5d1ebd559a';
  u3 uuid := '2cecbc8b-fa75-48d7-ac82-55385916d801';
begin
  select last_volume into baseline from public.half_night_counter where id;
  insert into public.events(title,started_at,event_kind,created_by,is_half_night,max_participants)
  values('test','2027-02-05 19:20+09','BOARDGAME',owner_id,true,2) returning id into a;
  select * into actual from public.events where id=a;
  if actual.title <> '[반나잇] 불금 Vol.'||(baseline+1)
    or actual.ended_at <> '2027-02-06 01:20+09'::timestamptz or actual.participation_fee<>20000 then
    raise exception 'Friday defaults failed';
  end if;
  insert into public.events(title,started_at,event_kind,created_by,is_half_night)
  values('test','2027-02-06 19:20+09','BOARDGAME',owner_id,true) returning id into b;
  if (select title from public.events where id=b) <> '[반나잇] 불토 Vol.'||(baseline+2) then
    raise exception 'Shared Saturday numbering failed';
  end if;
  update public.events set location='test' where id=a;
  if (select half_night_volume from public.events where id=a) <> baseline+1 then raise exception 'Edit changed volume'; end if;
  perform set_config('request.jwt.claim.sub',u1::text,true);
  perform public.join_half_night_event(a,'FIRST');
  perform set_config('request.jwt.claim.sub',u2::text,true);
  perform public.join_half_night_event(a,'SECOND');
  perform set_config('request.jwt.claim.sub',u3::text,true);
  perform public.join_half_night_event(a,'BOTH');
  if not exists(select 1 from public.event_participants where event_id=a and user_id=u1 and half_night_part='FIRST')
    or not exists(select 1 from public.event_participants where event_id=a and user_id=u2 and half_night_part='SECOND')
    or not exists(select 1 from public.event_waitlist where event_id=a and user_id=u3) then
    raise exception 'Part selection or capacity failed';
  end if;
  perform set_config('request.jwt.claim.sub',u1::text,true);
  perform public.cancel_event_join_or_waitlist(a);
  if not exists(select 1 from public.event_participants where event_id=a and user_id=u3 and half_night_part='BOTH') then
    raise exception 'Waitlist promotion lost selection';
  end if;
  if (select count(distinct title) from public.notifications where link='/events/'||a
      and title in ('반나잇 1부 참여','반나잇 2부 참여','반나잇 모두 참여')) <> 3 then
    raise exception 'Part-specific notification missing';
  end if;
end $$;
rollback;
select 'PASS: Friday/Saturday numbering, six hours, all three choices, waitlist promotion and notifications' as validation;
