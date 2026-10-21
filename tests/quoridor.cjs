const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {PGlite}=require('../.local-reference/clocktower/test-runtime/node_modules/@electric-sql/pglite');
const mod={exports:{}};
new Function('exports','require','module',ts.transpileModule(fs.readFileSync('lib/quoridor.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports,require,mod);
const {legalMoves,validWall,hasPath}=mod.exports;
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,activity_name text);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261021010000_quoridor.sql','utf8'));
 const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const scalar=async(sql,args=[])=>Object.values((await query(sql,args))[0])[0];
 const ids=[1,2,3].map(n=>`00000000-0000-0000-0000-00000000000${n}`);
 for(let i=0;i<3;i++){await query('insert into auth.users values($1)',[ids[i]]);await query('insert into profiles values($1,$2)',[ids[i],`멤버${i}`]);}
 const login=async(i)=>query("select set_config('request.jwt.claim.sub',$1,false)",[i===null?'':ids[i]]);
 const denied=async(fn)=>{await assert.rejects(fn);};
 await denied(()=>query('select quoridor_create()'));
 const cases=[
  [76,4,[],[67,75,77]], [40,31,[],[22,49,39,41]],
  [40,31,[{r:2,c:3,o:'h'}],[30,32,49,39,41]],
  [13,4,[],[3,5,22,12,14]], [8,17,[],[ -1,26,7].filter(n=>n>=0)],
 ];
 for(const [pos,opp,walls,expected] of cases){
  assert.deepEqual(legalMoves(pos,opp,walls).sort((a,b)=>a-b),expected.sort((a,b)=>a-b));
  assert.deepEqual(await scalar('select qr_moves($1,$2,$3)',[pos,opp,JSON.stringify(walls)]),legalMoves(pos,opp,walls));
 }
 assert(!validWall([{r:3,c:3,o:'h'}],[76,4],{r:3,c:3,o:'v'}),'crossing');
 assert(!validWall([{r:3,c:3,o:'h'}],[76,4],{r:3,c:4,o:'h'}),'overlap');
 assert(validWall([{r:3,c:3,o:'h'}],[76,4],{r:3,c:5,o:'h'}),'touching ends allowed');
 const enclosure=[{r:7,c:3,o:'v'},{r:7,c:4,o:'v'}];
 assert(!validWall(enclosure,[76,4],{r:7,c:3,o:'h'}),'last escape blocked');
 assert.equal(await scalar('select qr_wall_valid($1,$2,7,3,\'h\')',[JSON.stringify(enclosure),'[76,4]']),false);
 // Deterministic randomized parity of browser previews and server rules.
 let seed=123456; const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 let walls=[];
 for(let i=0;i<150;i++){
  const w={r:rand(8),c:rand(8),o:rand(2)?'h':'v'}, positions=[rand(81),rand(81)];
  const valid=validWall(walls,positions,w);
  assert.equal(await scalar('select qr_wall_valid($1,$2,$3,$4,$5)',[JSON.stringify(walls),JSON.stringify(positions),w.r,w.c,w.o]),valid);
  assert.deepEqual(await scalar('select qr_moves($1,$2,$3)',[...positions,JSON.stringify(walls)]),legalMoves(...positions,walls));
  if(valid&&walls.length<20)walls.push(w);
  if(i%25===24)walls=[];
 }
 await login(0);const id=await scalar('select quoridor_create()');
 assert.equal(await scalar('select quoridor_create()'),id,'no duplicate active room');
 const code=await scalar('select code from quoridor_rooms where id=$1',[id]);
 await login(1);await query('select quoridor_join($1)',[code]);
 await login(2);await denied(()=>query('select quoridor_join($1)',[code]));await denied(()=>query('select quoridor_snapshot($1)',[id]));
 const snap=()=>scalar('select quoridor_snapshot($1)',[id]);
 const act=(revision,action,payload={})=>query('select quoridor_action($1,$2,$3,$4)',[id,revision,action,JSON.stringify(payload)]);
 await denied(()=>act(1,'start'));
 await login(1);await denied(()=>act(1,'start'));
 await login(0);await act(1,'start');let s=await snap();
 await login(1-s.turn);await denied(()=>act(s.revision,'move',{target:67}));
 await login(s.turn);s=await snap();await denied(()=>act(s.revision-1,'move',{target:s.moves[0]}));
 await denied(()=>act(s.revision,'move',{target:40}));
 await denied(()=>act(s.revision,'wall',{r:8,c:0,o:'h'}));
 await denied(()=>act(s.revision,'wall',{r:null,c:0,o:'h'}));
 await act(s.revision,'wall',{r:3,c:3,o:'h'});
 let next=await snap();assert.equal(next.remaining[s.turn],9);assert.equal(next.turn,1-s.turn);
 await login(next.turn);await denied(()=>act(next.revision,'wall',{r:3,c:3,o:'v'}));
 // Moving to goal wins and subsequent play is rejected.
 await query("update quoridor_rooms set positions='[13,70]',turn=0,walls='[]' where id=$1",[id]);
 await login(0);s=await snap();await act(s.revision,'move',{target:4});s=await snap();assert.equal(s.status,'FINISHED');assert.equal(s.winner,0);
 await denied(()=>act(s.revision,'move',{target:13}));
 const id2=await scalar('select quoridor_create()');const code2=await scalar('select code from quoridor_rooms where id=$1',[id2]);
 await login(1);await query('select quoridor_join($1)',[code2]);
 await query("select quoridor_action($1,1,'leave')",[id2]);assert.equal(await scalar('select guest_id from quoridor_rooms where id=$1',[id2]),null);
 await query('select quoridor_join($1)',[code2]);await login(0);await query("select quoridor_action($1,3,'start')",[id2]);
 await login(1);await query("select quoridor_action($1,4,'leave')",[id2]);assert.equal(await scalar('select winner from quoridor_rooms where id=$1',[id2]),0);
 await db.exec('set role authenticated');
 await denied(()=>query('select * from quoridor_rooms'));
 await denied(()=>query("update quoridor_rooms set winner=1"));
 await denied(()=>query("select qr_moves(76,4,'[]')"));
 await login(0);assert(Array.isArray(await scalar('select quoridor_lobby()')));
 await db.exec('reset role');await db.close();
 console.log('PASS: movement/jump/diagonal/edge, walls/crossing/escape, 150 parity cases, auth, room lifecycle, turn/revision, victory, resign, grants');
})().catch(e=>{console.error(e);process.exit(1)});
