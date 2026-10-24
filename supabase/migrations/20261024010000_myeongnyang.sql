begin;
create table public.myeongnyang_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 started_at timestamptz not null default clock_timestamp(), queue int[] not null,
 score int, finished_at timestamptz
);
create index on public.myeongnyang_runs(user_id,started_at desc);
create table public.myeongnyang_bests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 score int not null check(score>=0), achieved_at timestamptz not null default clock_timestamp()
);
alter table public.myeongnyang_runs enable row level security;
alter table public.myeongnyang_bests enable row level security;
revoke all on public.myeongnyang_runs,public.myeongnyang_bests from public,anon,authenticated;
create function public.myeongnyang_start() returns jsonb language plpgsql security definer set search_path=public as $$
declare r myeongnyang_runs; uid uuid:=auth.uid();
begin
 if uid is null then raise exception '로그인 후 기록에 도전해 주세요.';end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 if exists(select 1 from myeongnyang_runs where user_id=uid and started_at>clock_timestamp()-interval '30 seconds') then raise exception '잠시 후 다시 시작해 주세요.';end if;
 insert into myeongnyang_runs(user_id,queue) values(uid,array(select floor(random()*2)::int from generate_series(1,600))) returning * into r;
 return jsonb_build_object('id',r.id,'queue',r.queue);
end $$;
create function public.myeongnyang_finish(p_run uuid,p_choices int[]) returns int language plpgsql security definer set search_path=public as $$
declare r myeongnyang_runs; points int:=0; i int;
begin
 select * into r from myeongnyang_runs where id=p_run and user_id=auth.uid() for update;
 if not found then raise exception '게임 기록을 찾을 수 없어요.';end if;
 if r.score is not null then return r.score;end if;
 if clock_timestamp()<r.started_at+interval '30 seconds' then raise exception '아직 게임이 진행 중이에요.';end if;
 if clock_timestamp()>r.started_at+interval '10 minutes' then raise exception '저장 가능 시간이 지났어요.';end if;
 if p_choices is null or cardinality(p_choices)>600 or (cardinality(p_choices)>0 and (array_ndims(p_choices)<>1 or array_lower(p_choices,1)<>1)) then raise exception '잘못된 입력이에요.';end if;
 for i in 1..cardinality(p_choices) loop
  if p_choices[i] is null or p_choices[i] not in(0,1) then raise exception '잘못된 입력이에요.';end if;
  points:=greatest(0,points+case when p_choices[i]=r.queue[i] then 1 else -1 end);
 end loop;
 update myeongnyang_runs set score=points,finished_at=clock_timestamp() where id=r.id;
 insert into myeongnyang_bests(user_id,score) values(r.user_id,points)
 on conflict(user_id) do update set score=excluded.score,achieved_at=clock_timestamp() where excluded.score>myeongnyang_bests.score;
 return points;
end $$;
create function public.myeongnyang_stats() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('mine',(select score from myeongnyang_bests where user_id=auth.uid()),
 'average',(select round(avg(score),1) from myeongnyang_bests),'count',(select count(*) from myeongnyang_bests),
 'leaders',coalesce((select jsonb_agg(t) from (select b.score,coalesce(nullif(p.activity_name,''),'멤버') as name
 from myeongnyang_bests b left join profiles p on p.id=b.user_id order by b.score desc,b.achieved_at,b.user_id limit 10)t),'[]'::jsonb)) $$;
revoke all on function public.myeongnyang_start(),public.myeongnyang_finish(uuid,int[]),public.myeongnyang_stats() from public,anon;
grant execute on function public.myeongnyang_start(),public.myeongnyang_finish(uuid,int[]),public.myeongnyang_stats() to authenticated;
commit;
