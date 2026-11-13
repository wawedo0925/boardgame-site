alter table public.video_studio_projects alter column updated_at set default now();

create table if not exists public.video_studio_recordings(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_studio_projects(id) on delete cascade,
  label text not null default '전체 촬영본',
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes > 0),
  duration_seconds integer,
  orientation text not null default '가로' check(orientation in ('가로','세로','기타')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.video_studio_edit_jobs(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.video_studio_projects(id) on delete cascade,
  status text not null default '촬영본 대기' check(status in ('촬영본 대기','편집 요청','편집 중','검수 대기','완료')),
  brief text not null default '',
  formats text[] not null default array['유튜브 가로형'],
  captions boolean not null default true,
  broll boolean not null default true,
  output_path text,
  updated_at timestamptz not null default now()
);

alter table public.video_studio_recordings enable row level security;
alter table public.video_studio_edit_jobs enable row level security;
create policy "main admins manage video recordings" on public.video_studio_recordings for all to authenticated using(public.is_main_admin()) with check(public.is_main_admin());
create policy "main admins manage video edit jobs" on public.video_studio_edit_jobs for all to authenticated using(public.is_main_admin()) with check(public.is_main_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('video-studio-videos','video-studio-videos',false,2147483648,array['video/mp4','video/quicktime','video/webm','video/x-m4v'])
on conflict(id) do update set public=false,file_size_limit=2147483648,allowed_mime_types=array['video/mp4','video/quicktime','video/webm','video/x-m4v'];

create policy "main admins read video studio videos" on storage.objects for select to authenticated using(bucket_id='video-studio-videos' and public.is_main_admin());
create policy "main admins upload video studio videos" on storage.objects for insert to authenticated with check(bucket_id='video-studio-videos' and public.is_main_admin());
create policy "main admins update video studio videos" on storage.objects for update to authenticated using(bucket_id='video-studio-videos' and public.is_main_admin()) with check(bucket_id='video-studio-videos' and public.is_main_admin());
create policy "main admins delete video studio videos" on storage.objects for delete to authenticated using(bucket_id='video-studio-videos' and public.is_main_admin());
