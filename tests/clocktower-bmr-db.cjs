const fs=require('fs'),path=require('path');
const {PGlite}=require(process.env.PGLITE_MODULE||'../.local-reference/clocktower/test-runtime/node_modules/@electric-sql/pglite');
async function createTestDb(){
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.profiles(id uuid primary key references auth.users,activity_name text,birth_year text,site_role text default 'MEMBER');
create table public.events(id uuid primary key default gen_random_uuid(),title text,event_kind text,event_status text default 'OPEN',created_by uuid);
create table public.event_participants(event_id uuid references public.events,user_id uuid references auth.users,primary key(event_id,user_id));
create table public.games(id uuid primary key default gen_random_uuid(),name text);
create table public.event_game_sessions(id uuid primary key default gen_random_uuid(),event_id uuid references public.events,game_id uuid references public.games,result_type text,created_by uuid,created_at timestamptz default now());
create table public.event_game_rounds(id uuid primary key default gen_random_uuid(),session_id uuid references public.event_game_sessions,round_number integer,created_by uuid,created_at timestamptz default now());
create table public.event_round_players(round_id uuid references public.event_game_rounds,user_id uuid references auth.users,role_name text,team_name text,is_winner boolean,is_gm boolean,updated_at timestamptz,primary key(round_id,user_id));
create function public.can_operate_event(uuid) returns boolean language sql as $$select exists(select 1 from public.events where id=$1 and created_by=auth.uid())$$;
create function public.current_site_role() returns text language sql as $$select site_role from public.profiles where id=auth.uid()$$;
create function public.is_main_admin() returns boolean language sql as $$select public.current_site_role()='MAIN_ADMIN'$$;
create function public.is_admin() returns boolean language sql as $$select public.current_site_role()='MAIN_ADMIN'$$;
`);
for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.includes('clocktower')&&f>='20260909080000'&&f<='20260926010000_clocktower_bad_moon_rising.sql').sort()){
 try{await db.exec(fs.readFileSync(path.join('supabase/migrations',f),'utf8'));}catch(e){throw new Error('Migration '+f+': '+e.message,{cause:e});}
}
return db;
}
module.exports={createTestDb};
if(require.main===module)(async()=>{
const db=await createTestDb();
console.log('All Clocktower migrations applied in isolated PostgreSQL');
await db.exec(fs.readFileSync('tests/clocktower-bmr-db.sql','utf8'));
console.log('PASS: BMR database integration');await db.close();
})().catch(e=>{console.error(e.message,e.cause?.where||'',e.where||'');process.exit(1)});
