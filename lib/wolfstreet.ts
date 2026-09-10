export const WOLF_BUCKETS = ['울프스트리트/투자자','울프스트리트/중개인','울프스트리트/총액'] as const;
export type WolfMode = 'SPLIT'|'COMBINED';
export function isWolfStreet(name?:string|null) {
 return ['울프스트리트','wolfstreet'].includes((name??'').replace(/[\s:：-]/g,'').toLowerCase());
}
export function wolfBucketLabel(bucket:string) {
 return bucket===WOLF_BUCKETS[0]?'5~11인 · 투자자':bucket===WOLF_BUCKETS[1]?'5~11인 · 중개인':bucket===WOLF_BUCKETS[2]?'3~4인 · 총액':'기존 미분류';
}
export type WolfInput={userId:string;isGm?:boolean;score:number|null;category:string};
export function wolfResults(mode:WolfMode,rows:WolfInput[]) {
 const active=rows.filter(p=>!p.isGm);
 if(!['SPLIT','COMBINED'].includes(mode))throw new Error('버전을 선택해 주세요.');
 if(mode==='SPLIT'?(active.length<5||active.length>11):(active.length<3||active.length>4))throw new Error(mode==='SPLIT'?'5~11인 버전은 참가자 5~11명이 필요합니다.':'3~4인 버전은 참가자 3~4명이 필요합니다.');
 if(new Set(rows.map(p=>p.userId)).size!==rows.length)throw new Error('참가자가 중복되었습니다.');
 if(active.some(p=>p.score===null||!Number.isSafeInteger(p.score)))throw new Error('모든 참가자의 최종 금액을 정수로 입력해 주세요.');
 if(mode==='SPLIT'&&(active.some(p=>!WOLF_BUCKETS.slice(0,2).includes(p.category as typeof WOLF_BUCKETS[0]))||WOLF_BUCKETS.slice(0,2).some(c=>!active.some(p=>p.category===c))))throw new Error('모든 참가자를 투자자·중개인으로 지정하고 두 역할을 모두 포함해 주세요.');
 return rows.map(p=>{
  const category=mode==='COMBINED'?WOLF_BUCKETS[2]:p.category;
  const peers=active.filter(x=>mode==='COMBINED'||x.category===category);
  const rank=p.isGm?null:1+peers.filter(x=>x.score!>p.score!).length;
  return {...p,category:p.isGm?null:category,rank,isWinner:p.isGm?null:rank===1};
 });
}
export function wolfScoreLabel(p:{role_name?:string|null;score:number|null;rank?:number|null;is_winner?:boolean|null}) {
 if(!WOLF_BUCKETS.includes(p.role_name as typeof WOLF_BUCKETS[number])||p.score===null)return null;
 return `${wolfBucketLabel(p.role_name!)} · ${p.score.toLocaleString()} · ${p.rank??'-'}위${p.is_winner?' · 승리':''}`;
}
