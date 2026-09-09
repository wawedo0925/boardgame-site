begin;

drop policy if exists notices_manager_delete on public.notices;
create policy notices_main_admin_delete on public.notices
for delete to authenticated using (public.current_site_role() = 'MAIN_ADMIN');

-- Also restrict any other permissive deletion policy already present.
create policy notices_delete_main_admin_only on public.notices as restrictive
for delete to public using (public.current_site_role() = 'MAIN_ADMIN');

-- Public notices expose only their authors' activity names, not full profiles.
create or replace function public.get_notice_authors(notice_ids uuid[])
returns table(notice_id uuid, author_name text)
language sql stable security definer set search_path = public
as $$
  select n.id, coalesce(nullif(btrim(p.activity_name), ''), '작성자 정보 없음')
  from public.notices n left join public.profiles p on p.id = n.author_id
  where n.id = any(notice_ids);
$$;
revoke all on function public.get_notice_authors(uuid[]) from public;
grant execute on function public.get_notice_authors(uuid[]) to anon, authenticated;

commit;
