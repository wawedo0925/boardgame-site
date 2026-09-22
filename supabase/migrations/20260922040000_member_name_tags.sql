begin;

create table public.member_name_tags (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  has_name_tag boolean not null default false
);

alter table public.member_name_tags enable row level security;
revoke all on public.member_name_tags from anon, authenticated;
grant select, insert, update on public.member_name_tags to authenticated;

create policy member_name_tags_read on public.member_name_tags
  for select to authenticated using (true);
create policy member_name_tags_insert on public.member_name_tags
  for insert to authenticated with check (public.is_main_admin() is true);
create policy member_name_tags_update on public.member_name_tags
  for update to authenticated using (public.is_main_admin() is true)
  with check (public.is_main_admin() is true);

notify pgrst, 'reload schema';
commit;
