begin;
do $$
declare actor uuid; eid uuid; fee integer; seats integer; rejected boolean:=false;
begin
 select user_id into actor from public.site_roles where role='MAIN_ADMIN' limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.events(title,event_kind,created_by,started_at,ended_at,max_participants,participation_fee,location)
 values('🃏 [홀덤] 텍사스 홀덤','HOLDEM',actor,'2030-01-01 19:20+09','2030-01-01 22:20+09',10,null,'잠원동 22-15 지하1층 와위두(옥된장건물)')
 returning id,participation_fee into eid,fee;
 if fee<>10000 then raise exception 'Default fee failed'; end if;
 perform public.update_event_information(eid,'홀덤 수정 테스트','2030-01-02 20:00+09','2030-01-02 23:00+09','수정 장소','수정 안내');
 perform public.update_event_participation_fee(eid,7000);
 perform public.update_event_capacity(eid,8);
 select participation_fee,max_participants into fee,seats from public.events where id=eid;
 if fee<>7000 or seats<>8 then raise exception 'Editable defaults failed'; end if;
 if public.event_notification_label('2030-01-02 20:00+09','HOLDEM')<>'1/2 홀덤' then raise exception 'Notification label failed'; end if;
 begin update public.events set recurrence_series_id=gen_random_uuid() where id=eid; exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'Recurring Holdem allowed'; end if;
end $$;
rollback;
select 'PASS: Holdem creation, default fee, editable details/capacity/fee, notification, no recurrence; rolled back' as result;
