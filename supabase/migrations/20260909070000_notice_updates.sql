begin;
alter table public.notices add column if not exists is_update boolean not null default false;
update public.notices set is_update = true where title like '[업데이트]%' or title = '최신업데이트 확인하기';
create index if not exists notices_updates_created_idx on public.notices (created_at desc, id desc) where is_update;
commit;
select title, is_update from public.notices order by created_at desc limit 10;
