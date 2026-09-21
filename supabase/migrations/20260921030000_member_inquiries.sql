begin;
create table public.member_inquiries (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 author_name text not null,
 is_anonymous boolean not null default true,
 body text not null check(length(trim(body)) between 1 and 5000),
 status text not null default 'RECEIVED' check(status in ('RECEIVED','ANSWERED','CHECKED')),
 reply text,
 created_at timestamptz not null default now(),
 handled_at timestamptz,
 handled_by uuid references auth.users(id) on delete set null,
 check((status='ANSWERED' and reply is not null and length(trim(reply)) between 1 and 5000) or (status<>'ANSWERED' and reply is null))
);
create index member_inquiries_owner_date on public.member_inquiries(user_id,created_at desc);
alter table public.member_inquiries enable row level security;
revoke all on public.member_inquiries from public,anon,authenticated;
grant select on public.member_inquiries to authenticated;
create policy private_member_inquiries on public.member_inquiries for select to authenticated
 using(user_id=auth.uid() or public.is_main_admin());

create function public.submit_member_inquiry(p_id uuid,p_body text,p_anonymous boolean default true) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); existing public.member_inquiries%rowtype; member_name text;
begin
 if u is null then raise exception '로그인이 필요합니다.'; end if;
 if p_id is null or p_body is null or length(trim(p_body)) not between 1 and 5000 or p_anonymous is null then raise exception '내용을 1~5,000자로 입력해 주세요.'; end if;
 select coalesce(nullif(trim(activity_name),''),'멤버') into member_name from public.profiles where id=u;
 insert into public.member_inquiries(id,user_id,author_name,is_anonymous,body)
 values(p_id,u,coalesce(member_name,'멤버'),p_anonymous,trim(p_body)) on conflict(id) do nothing;
 select * into existing from public.member_inquiries where id=p_id;
 if existing.user_id<>u or existing.body<>trim(p_body) or existing.is_anonymous<>p_anonymous then raise exception '다른 요청에 사용된 번호입니다. 새로고침 후 다시 시도해 주세요.'; end if;
 return p_id;
end $$;
create function public.handle_member_inquiry(p_id uuid,p_status text,p_reply text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or public.is_main_admin() is not true then raise exception '메인 관리자만 처리할 수 있습니다.'; end if;
 if p_status is null or p_status not in ('ANSWERED','CHECKED') then raise exception '처리 상태를 확인해 주세요.'; end if;
 if p_status='ANSWERED' and (p_reply is null or length(trim(p_reply)) not between 1 and 5000) then raise exception '답변을 1~5,000자로 입력해 주세요.'; end if;
 -- A simple acknowledgement must not erase a previously written answer.
 update public.member_inquiries set status=p_status,reply=case when p_status='ANSWERED' then trim(p_reply) else null end,
 handled_at=now(),handled_by=auth.uid()
 where id=p_id and (p_status='ANSWERED' or status<>'ANSWERED');
 if not found then raise exception '항목이 없거나 이미 답변이 등록되었습니다. 새로고침해 주세요.'; end if;
end $$;
revoke all on function public.submit_member_inquiry(uuid,text,boolean),public.handle_member_inquiry(uuid,text,text) from public,anon;
grant execute on function public.submit_member_inquiry(uuid,text,boolean),public.handle_member_inquiry(uuid,text,text) to authenticated;
commit;
