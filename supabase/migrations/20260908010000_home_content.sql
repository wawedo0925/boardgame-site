begin;

create table public.home_content (
  id boolean primary key default true check (id),
  eyebrow text not null check (char_length(btrim(eyebrow)) > 0 and char_length(eyebrow) <= 80),
  title text not null check (char_length(btrim(title)) > 0 and char_length(title) <= 200),
  description text not null check (char_length(btrim(description)) > 0 and char_length(description) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.home_content (id, eyebrow, title, description)
values (true, 'BOARD GAME COMMUNITY', E'함께 플레이하고\n우리의 게임을\n기록합니다.',
  '보드라운지는 와위두에서 만나는 보드게임 커뮤니티입니다. 이벤트에 참여하고, 플레이 기록과 평가를 남겨보세요.');

alter table public.home_content enable row level security;
revoke all on public.home_content from anon, authenticated;
grant select (id, eyebrow, title, description) on public.home_content to anon, authenticated;
grant update (eyebrow, title, description) on public.home_content to authenticated;

create policy "Everyone can read homepage text" on public.home_content
  for select to anon, authenticated using (true);
create policy "Only main admins can edit homepage text" on public.home_content
  for update to authenticated
  using ((select public.current_site_role()) = 'MAIN_ADMIN')
  with check ((select public.current_site_role()) = 'MAIN_ADMIN');

create function public.stamp_home_content_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger stamp_home_content_update before update on public.home_content
for each row execute function public.stamp_home_content_update();

commit;
