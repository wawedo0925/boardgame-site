begin;
alter table public.myeongnyang_runs add column cancelled_at timestamptz;
create or replace function public.myeongnyang_start() returns jsonb language plpgsql security definer set search_path=public as $$
declare r myeongnyang_runs; uid uuid:=auth.uid();
begin
 if uid is null then raise exception '로그인 후 기록에 도전해 주세요.';end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 update myeongnyang_runs set cancelled_at=clock_timestamp() where user_id=uid and score is null and cancelled_at is null;
 insert into myeongnyang_runs(user_id,started_at,queue) values(uid,clock_timestamp()+interval '2 seconds',array(select floor(random()*2)::int from generate_series(1,600))) returning * into r;
 return jsonb_build_object('id',r.id,'queue',r.queue);
end $$;
create or replace function public.myeongnyang_finish(p_run uuid,p_choices int[]) returns int language plpgsql security definer set search_path=public as $$
declare r myeongnyang_runs; points int:=0; i int;
begin
 select * into r from myeongnyang_runs where id=p_run and user_id=auth.uid() for update;
 if not found then raise exception '게임 기록을 찾을 수 없어요.';end if;
 if r.cancelled_at is not null then raise exception '새 게임이 시작되어 이전 판은 종료됐어요.';end if;
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
commit;
