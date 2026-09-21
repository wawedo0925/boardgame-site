begin;
create or replace function public.submit_member_inquiry(p_id uuid,p_body text,p_anonymous boolean default true) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); existing public.member_inquiries%rowtype; member_name text; recipient uuid; sent_at timestamptz; day_start timestamptz;
begin
 if u is null then raise exception '로그인이 필요합니다.'; end if;
 if p_id is null or p_body is null or length(trim(p_body)) not between 1 and 5000 or p_anonymous is null then raise exception '내용을 1~5,000자로 입력해 주세요.'; end if;
 -- Serialize submissions from the same member, including multiple devices.
 perform pg_advisory_xact_lock(hashtextextended('member-inquiry:'||u::text,0));
 select * into existing from public.member_inquiries where id=p_id;
 if found then
   if existing.user_id<>u or existing.body<>trim(p_body) or existing.is_anonymous<>p_anonymous then raise exception '다른 요청에 사용된 번호입니다. 새로고침 후 다시 시도해 주세요.'; end if;
   return p_id;
 end if;
 sent_at:=clock_timestamp();
 day_start:=date_trunc('day',sent_at at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 if (select count(*) from public.member_inquiries where user_id=u and created_at>=day_start and created_at<day_start+interval '1 day')>=2 then
   raise exception '문의/제보는 하루 최대 2건까지 보낼 수 있습니다. 한국 시간 자정 이후 다시 이용해 주세요.';
 end if;
 select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from public.profiles where id=u;
 insert into public.member_inquiries(id,user_id,author_name,is_anonymous,body,created_at)
 values(p_id,u,coalesce(member_name,'멤버'),p_anonymous,trim(p_body),sent_at);
 for recipient in select user_id from public.site_roles where role='MAIN_ADMIN' loop
   perform public.create_member_notification(recipient,'MEMBER_INQUIRY','새 문의/제보',
     '새 문의/제보가 접수되었습니다. 관리자 페이지에서 확인해 주세요.',
     '/admin/inquiries','inquiry:'||p_id);
 end loop;
 return p_id;
end $$;

create or replace function public.enqueue_participant_push() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.type not in ('EVENT_JOINED','EVENT_REFUND','MEMBER_INQUIRY') then return new; end if;
  insert into public.push_deliveries(subscription_id,notification_id,title,message,link)
    select s.id,new.id,new.title,new.message,coalesce(new.link,'/notifications') from public.push_subscriptions s
    join public.push_settings c on c.id and c.recipient_id=s.user_id where s.user_id=new.recipient_id
    on conflict(subscription_id,notification_id) do nothing;
  perform public.dispatch_participant_push();
  return new;
end $$;
commit;
