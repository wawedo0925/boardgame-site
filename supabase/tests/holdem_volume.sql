begin;
do $$
declare actor uuid; first_id uuid; next_id uuid; baseline integer; v integer; t text;
begin
 select user_id into actor from public.site_roles where role='MAIN_ADMIN' limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select last_volume into baseline from public.event_kind_counters where event_kind='HOLDEM';
 insert into public.events(title,event_kind,created_by,started_at) values('🃏 [홀덤] 텍사스 홀덤','HOLDEM',actor,now()+interval '2 days') returning id,volume_number,title into first_id,v,t;
 if v<>baseline+1 or t<>'🃏 [홀덤] 텍사스 홀덤 Vol.'||v then raise exception 'First volume failed'; end if;
 insert into public.events(title,event_kind,created_by,started_at) values('🃏 [홀덤] 텍사스 홀덤 Vol.99','HOLDEM',actor,now()+interval '3 days') returning id,volume_number,title into next_id,v,t;
 if v<>baseline+2 or t<>'🃏 [홀덤] 텍사스 홀덤 Vol.'||v then raise exception 'Next volume or suffix normalization failed'; end if;
 update public.events set title='홀덤 수정',volume_number=9999 where id=first_id returning volume_number,title into v,t;
 if v<>baseline+1 or t<>'홀덤 수정 Vol.'||v then raise exception 'Edit changed volume'; end if;
 delete from public.events where id=next_id;
 insert into public.events(title,event_kind,created_by,started_at) values('홀덤','HOLDEM',actor,now()+interval '4 days') returning volume_number into v;
 if v<>baseline+3 then raise exception 'Deleted volume reused'; end if;
 insert into public.events(title,event_kind,created_by,started_at) values('일반 테스트','GENERAL',actor,now()+interval '2 days') returning volume_number,title into v,t;
 if v is not null or t<>'일반 테스트' then raise exception 'Other event affected'; end if;
end $$;
rollback;
select 'PASS: consecutive volumes, suffix normalization, edit preservation, no reuse after delete, other kinds unchanged; rolled back' as result;
