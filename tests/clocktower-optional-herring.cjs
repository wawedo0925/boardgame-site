const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {randomInformation,informationErrors,needsHerring}=require('../lib/clocktower/information.ts');
const {propose,emptyEngine}=require('../lib/clocktower/night.ts');
const {createTestDb}=require('./clocktower-bmr-db.cjs');
const roles=['군인','요리사','시장','첩자','임프'];
const members=roles.map((role,i)=>({user_id:`30000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`,name:`P${i}`,seat:i+1,alive:true,actual_role:role,shown_role:role}));
let draft=randomInformation(members);
assert.equal(needsHerring(members),false);assert.equal(draft.red_herring,undefined);
assert.deepEqual(informationErrors(draft.information,undefined,members),[]);
assert(!propose({user_id:members[3].user_id,role:'첩자',key:'spy'},[],{...emptyEngine(),...draft,red_herring:members[0].user_id},members).result.includes('점쟁이 허상'));
(async()=>{
 const db=await createTestDb();
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.includes('clocktower')&&f>'20260926010000_clocktower_bad_moon_rising.sql').sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 // Repeat safely, as dashboard deployments may be retried.
 await db.exec(fs.readFileSync('supabase/migrations/20261107010000_clocktower_optional_herring.sql','utf8'));
 const host='10000000-0000-0000-0000-000000000001',event='20000000-0000-0000-0000-000000000001';
 await db.query('insert into auth.users(id) select unnest($1::uuid[])',[[host,...members.map(m=>m.user_id)]]);
 await db.query("insert into public.profiles(id,activity_name,site_role) values($1,'Host','MAIN_ADMIN')",[host]);
 await db.query("insert into public.events(id,title,event_kind,created_by) values($1,'test','CLOCKTOWER',$2)",[event,host]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[host]);
 await db.query("select public.clocktower_live_command($1,'create','{}')",[event]);
 const room=(await db.query('select id from public.clocktower_live_rooms where event_id=$1',[event])).rows[0].id;
 for(const m of members)await db.query('insert into public.clocktower_live_members(room_id,user_id,seat,actual_role,shown_role) values($1,$2,$3,$4,$5)',[room,m.user_id,m.seat,m.actual_role,m.shown_role]);
 const validate=herring=>db.query('select public.clocktower_validate_information($1,$2::jsonb,$3)',[room,JSON.stringify(draft.information),herring??null]);
 await validate();await validate(members[0].user_id);
 for(const actual of ['점쟁이','주정뱅이']){
  members[0].actual_role=actual;members[0].shown_role='점쟁이';draft=randomInformation(members);
  await db.query('update public.clocktower_live_members set actual_role=$1,shown_role=$2 where room_id=$3 and user_id=$4',[actual,'점쟁이',room,members[0].user_id]);
  assert(needsHerring(members));assert(draft.red_herring);
  assert(informationErrors(draft.information,undefined,members).length);
  await assert.rejects(()=>validate(),/허상/);await validate(draft.red_herring);
  await assert.rejects(()=>validate(members[4].user_id),/허상/);
 }
 members[0].actual_role='군인';members[0].shown_role='군인';draft=randomInformation(members);
 await db.query("update public.clocktower_live_members set actual_role='군인',shown_role='군인' where room_id=$1 and user_id=$2",[room,members[0].user_id]);
 await validate();assert.equal(draft.red_herring,undefined);
 await db.close();console.log('PASS optional herring generation, role edits, Drunk cover, stale Spy display, PostgreSQL validation and migration retry');
})().catch(e=>{console.error(e);process.exit(1)});
