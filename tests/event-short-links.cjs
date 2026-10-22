const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('../.local-reference/clocktower/test-runtime/node_modules/@electric-sql/pglite');
(async () => {
 const db = new PGlite();
 await db.exec(`create role anon;create role authenticated;
 create table events(id uuid primary key default gen_random_uuid(),event_kind text,title text,started_at timestamptz,created_at timestamptz default now());
 insert into events(event_kind,title,started_at) values ('BOARDGAME','later','2026-10-22'),('BOARDGAME','earlier','2026-10-21'),('MURDER_MYSTERY','murder','2026-10-21');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261022020000_event_short_links.sql','utf8'));
 const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
 assert.deepEqual((await rows('select short_code from events order by title')).map(r=>r.short_code),['b1','b2','m1']);
 for(const [kind,prefix] of [['BOARDGAME','b'],['MURDER_MYSTERY','m'],['CLOCKTOWER','c'],['HOLDEM','h'],['GENERAL','g']]) {
  const [e]=await rows("insert into events(event_kind,title,started_at,short_code) values($1,'test',now(),'b999') returning id,short_code",[kind]);
  assert(e.short_code.startsWith(prefix));assert.notEqual(e.short_code,'b999');
  await rows("update events set title='edited',started_at='2020-01-01',event_kind='GENERAL',short_code='h999' where id=$1",[e.id]);
  assert.equal((await rows('select short_code from events where id=$1',[e.id]))[0].short_code,e.short_code);
 }
 const [before]=await rows("insert into events(event_kind,title) values('HOLDEM','remove') returning short_code,id");
 await rows('delete from events where id=$1',[before.id]);
 const [after]=await rows("insert into events(event_kind,title) values('HOLDEM','after') returning short_code");
 assert(Number(after.short_code.slice(1))>Number(before.short_code.slice(1)));
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select * from event_short_link_counters'));
 await assert.rejects(()=>db.query("update event_short_link_counters set last_number=0"));
 await db.close();console.log('PASS: chronological backfill, all prefixes, monotonic numbering, immutable codes, no reuse, counter permissions');
})().catch(e=>{console.error(e);process.exit(1)});
