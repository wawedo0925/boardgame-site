'use client';
import { useEffect, useState } from 'react';
import type { LiveMember } from '@/lib/clocktower/live';
import { bmrInformationErrors, bmrInformationRecipients, bmrRoster, makeBmrInformation, type BmrInformation } from '@/lib/clocktower/bmr-information';
import { bmrSelectionStatus, startBmr } from '@/lib/clocktower/bmr-engine';
import ClocktowerMemberChoices from './ClocktowerMemberChoices';

export default function ClocktowerBmrInformationSetup({members,saved,busy,save,onEditingChange}:{members:LiveMember[];saved?:BmrInformation;busy:boolean;save:(info:BmrInformation)=>Promise<boolean>;onEditingChange:(editing:boolean)=>void}) {
 const [draft,setDraft]=useState<BmrInformation|null>(null);
 useEffect(()=>()=>onEditingChange(false),[onEditingChange]);
 const prepared=saved?.roster===bmrRoster(members);
 const engine=startBmr(members);
 const errors=draft?bmrInformationErrors(draft,members):[];
 const button='rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40';
 return <section className="space-y-4 rounded-3xl border border-violet-400/30 p-5"><h2 className="text-xl font-bold">시작 전 비밀 정보 설정</h2><p className="text-sm leading-6 text-zinc-400">기본 초안을 확인하고 원하는 부분을 수정해 저장하세요. 실제 전달은 첫 밤의 해당 차례에서 다시 확인합니다.</p>
 <div className="flex gap-3"><button disabled={busy||members.some(m=>!m.actual_role)} className={button} onClick={()=>{setDraft(makeBmrInformation(members));onEditingChange(true);}}>기본 정보 초안 만들기</button>{prepared&&!draft&&<button disabled={busy} className={button} onClick={()=>{setDraft(structuredClone(saved!));onEditingChange(true);}}>저장한 설정 수정</button>}</div>
 {prepared&&!draft&&<p className="text-sm text-emerald-300">비밀 정보 저장 완료</p>}
 {draft&&<><p className="text-sm text-violet-200">편집 중 · 저장 전에는 적용되지 않습니다.</p>{bmrInformationRecipients(members).map(m=><label key={m.infoKey} className="block space-y-2"><span>{m.name} · {m.infoRole}</span><textarea disabled={busy} maxLength={2000} rows={4} className="w-full rounded-xl border border-white/20 bg-zinc-900 p-3" value={draft.messages[m.infoKey]??''} onChange={e=>setDraft({...draft,messages:{...draft.messages,[m.infoKey]:e.target.value}})}/></label>)}
 {members.filter(m=>m.actual_role==='할머니').map(m=><div key={m.user_id} className="space-y-3"><h3>{m.name} · 손주 선택</h3><ClocktowerMemberChoices members={engine.players.map(p=>({id:p.id,name:p.name,role:p.role,...bmrSelectionStatus(engine,p)}))} allowed={engine.players.filter(p=>p.id!==m.user_id&&p.faction==='GOOD').map(p=>p.id)} busy={busy} selected={draft.grandchildren[m.user_id]} onChoose={id=>setDraft({...draft,grandchildren:{...draft.grandchildren,[m.user_id]:id}})}/></div>)}
 {errors.map(e=><p key={e} className="text-amber-200">{e}</p>)}<div className="flex gap-3"><button disabled={busy||!!errors.length} className={`${button} bg-violet-400 font-bold text-zinc-950`} onClick={async()=>{if(await save(draft)){setDraft(null);onEditingChange(false);}}}>비밀 정보 저장</button><button disabled={busy} className={button} onClick={()=>{setDraft(null);onEditingChange(false);}}>취소</button></div></>}
 </section>;
}
