begin;
create function public.valid_murder_preferences(a jsonb) returns boolean
language sql immutable set search_path=public as $$
 select jsonb_typeof(a)='object'
 and a ?& array['culprit','acting','deduction','suspected','support','objective','leading']
 and (select count(*)=7 and bool_and(value in ('"like"'::jsonb,'"neutral"'::jsonb,'"avoid"'::jsonb,'"unsure"'::jsonb)) from jsonb_each(case when jsonb_typeof(a)='object' then a else '{}'::jsonb end));
$$;
create table public.murder_play_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 answers jsonb not null check(public.valid_murder_preferences(answers)),
 updated_at timestamptz not null default now()
);
alter table public.murder_play_preferences enable row level security;
revoke all on public.murder_play_preferences from anon,authenticated;
grant select,insert,update on public.murder_play_preferences to authenticated;
create policy own_preferences_read on public.murder_play_preferences for select to authenticated using(user_id=auth.uid());
create policy own_preferences_insert on public.murder_play_preferences for insert to authenticated with check(user_id=auth.uid());
create policy own_preferences_update on public.murder_play_preferences for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create function public.stamp_murder_preferences() returns trigger language plpgsql set search_path=public as $$begin new.updated_at:=now(); return new; end$$;
create trigger stamp_murder_preferences before insert or update on public.murder_play_preferences for each row execute function public.stamp_murder_preferences();
create function public.event_murder_preferences(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(
   select 1 from public.event_participants p join public.events e on e.id=p.event_id
   where p.event_id=p_event_id and e.event_kind='MURDER_MYSTERY'
     and p.user_id=auth.uid() and p.participation_role='GM' and not p.gm_pending
     and p.attendance_status::text<>'ABSENT'
 ) then return jsonb_build_object('allowed',false); end if;
 return jsonb_build_object('allowed',true,'members',coalesce((
   select jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',coalesce(f.activity_name,'멤버'),
     'answers',a.answers,'updated_at',a.updated_at) order by p.joined_at)
   from public.event_participants p left join public.profiles f on f.id=p.user_id
   left join public.murder_play_preferences a on a.user_id=p.user_id
   where p.event_id=p_event_id and p.participation_role='PLAYER' and not p.gm_pending
     and p.attendance_status::text<>'ABSENT' and p.user_id<>auth.uid()
 ),'[]'::jsonb));
end $$;
revoke all on function public.event_murder_preferences(uuid) from public,anon;
grant execute on function public.event_murder_preferences(uuid) to authenticated;
commit;
