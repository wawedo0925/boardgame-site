import type { LiveVote } from './live';
export function voteSlot(v:LiveVote,now:number) {
 const start=Date.parse(v.started_at??'');
 if(v.status!=='RUNNING'||!Number.isFinite(start))return {index:-1,userId:null,remaining:0,preparing:false,finished:v.status==='DONE'};
 const index=Math.floor((now-start)/3000);
 return {index,userId:index>=0&&index<v.voter_order.length?v.voter_order[index]:null,remaining:Math.max(0,Math.ceil(((index<0?start:start+(index+1)*3000)-now)/1000)),preparing:index<0,finished:index>=v.voter_order.length};
}
export function voteOutcome(votes:LiveVote[]) {
 const done=votes.filter(v=>v.status==='DONE');
 const counts=done.map(v=>({vote:v,count:Object.values(v.ballots).filter(Boolean).length}));
 const top=Math.max(0,...counts.map(v=>v.count));
 const leaders=counts.filter(v=>v.count===top);
 return leaders.length===1&&top>=leaders[0].vote.threshold?leaders[0]:null;
}
