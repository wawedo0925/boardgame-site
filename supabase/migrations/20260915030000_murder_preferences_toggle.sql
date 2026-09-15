begin;
create table public.murder_preference_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default true
);
insert into public.murder_preference_settings(id,enabled) values(true,true);
alter table public.murder_preference_settings enable row level security;
revoke all on public.murder_preference_settings from public,anon,authenticated;
grant select on public.murder_preference_settings to authenticated;
create policy preference_setting_read on public.murder_preference_settings for select to authenticated using(true);
create function public.murder_preferences_enabled() returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce((select enabled from public.murder_preference_settings where id),false);
$$;
revoke all on function public.murder_preferences_enabled() from public,anon;
grant execute on function public.murder_preferences_enabled() to authenticated;
create function public.set_murder_preferences_enabled(p_enabled boolean) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.is_main_admin() then raise exception '메인 관리자만 변경할 수 있습니다.'; end if;
 if p_enabled is null then raise exception '활성화 여부를 선택해 주세요.'; end if;
 update public.murder_preference_settings set enabled=p_enabled where id;
 return p_enabled;
end $$;
revoke all on function public.set_murder_preferences_enabled(boolean) from public,anon;
grant execute on function public.set_murder_preferences_enabled(boolean) to authenticated;
alter policy own_preferences_read on public.murder_play_preferences using(user_id=auth.uid() and public.murder_preferences_enabled());
alter policy own_preferences_insert on public.murder_play_preferences with check(user_id=auth.uid() and public.murder_preferences_enabled());
alter policy own_preferences_update on public.murder_play_preferences using(user_id=auth.uid() and public.murder_preferences_enabled()) with check(user_id=auth.uid() and public.murder_preferences_enabled());
create or replace function public.stamp_murder_preferences() returns trigger language plpgsql set search_path=public as $$
begin
 if not public.murder_preferences_enabled() then raise exception '플레이 성향 기능이 비활성화되었습니다.'; end if;
 new.updated_at:=now(); return new;
end $$;
-- Retain the established assigned-GM checks and add the feature gate.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.event_murder_preferences(uuid)'::regprocedure);
 if position('if auth.uid() is null or not exists(' in definition)=0 then raise exception 'GM 조회 함수 구조를 확인해 주세요.'; end if;
 definition:=replace(definition,'if auth.uid() is null or not exists(', 'if not public.murder_preferences_enabled() or auth.uid() is null or not exists(');
 execute definition;
end $$;
commit;
