create or replace function public.my_legacy_play_total()
returns bigint language sql stable security definer set search_path=public as $$
  select coalesce(sum(g.play_count),0)::bigint
  from public.play_records r
  join public.play_record_games g on g.play_record_id=r.id
  where r.user_id=auth.uid();
$$;
revoke all on function public.my_legacy_play_total() from public,anon;
grant execute on function public.my_legacy_play_total() to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
