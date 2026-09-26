// Run from the repository root. PGLITE_MODULE can point to a separately installed test runtime.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const env={...process.env,PGLITE_MODULE:process.env.PGLITE_MODULE||path.resolve('.local-reference/clocktower/test-runtime/node_modules/@electric-sql/pglite')};
const files=fs.readdirSync('tests').filter(f=>/^clocktower.*\.cjs$/.test(f)).sort();
const outcomes=[];for(const file of files){
 const started=Date.now();const result=cp.spawnSync(process.execPath,[path.join('tests',file)],{env,encoding:'utf8',timeout:300000});
 const status=result.status===0?'PASS':'FAIL';const output=[result.stdout,result.stderr,result.error?.message].filter(Boolean).join('\n');
 outcomes.push({file,status,ms:Date.now()-started,output});console.log(`${status}: ${file} (${Math.round((Date.now()-started)/1000)}s)`);
 if(status==='FAIL')console.log(output);
}
const report={completedAt:new Date().toISOString(),suites:outcomes.length,failed:outcomes.filter(r=>r.status==='FAIL').map(r=>r.file),outcomes};
const folder='.local-reference/clocktower/test-results';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'latest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({suites:report.suites,failed:report.failed,report:path.join(folder,'latest.json')}));if(report.failed.length)process.exitCode=1;
