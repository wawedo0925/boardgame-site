"use client";
import { useEffect, useState } from 'react';
import type { LiveMember } from '@/lib/clocktower/live';
import type { NightEngine } from '@/lib/clocktower/night';
import { bluffOptions, clueTypes, informationErrors, randomInformation, registrationOptions, rosterKey, type InformationSetup } from '@/lib/clocktower/information';
import { roleType, setupRoles, validateAssignments } from '@/lib/clocktower/setup';
import { ClocktowerName } from './ClocktowerSeating';

const field='mt-2 w-full rounded-xl border border-white/15 bg-zinc-900 p-3 text-white';
const memberLabel=(m:LiveMember)=>`${m.seat}. ${m.name}(${m.actual_role||'미배정'})${m.shown_role&&m.shown_role!==m.actual_role?` · 표시: ${m.shown_role}`:''}`;
const button='rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40';
type Draft={information:InformationSetup;red_herring?:string};
export default function ClocktowerInformationSetup({members,engine,busy,save,onEditingChange}:{members:LiveMember[];engine:NightEngine;busy:boolean;save:(draft:Draft)=>Promise<boolean>;onEditingChange:(value:boolean)=>void}) {
  const [draft,setDraft]=useState<Draft|null>(null);
  const [base,setBase]=useState('');
  useEffect(()=>()=>onEditingChange(false),[onEditingChange]);
  const saved=engine.information?{information:engine.information,red_herring:engine.red_herring}:null;
  const visible=draft??saved;
  const roleErrors=validateAssignments(members.map(m=>({user_id:m.user_id,actual_role:m.actual_role??'',shown_role:m.shown_role??''})));
  const errors=informationErrors(visible?.information,visible?.red_herring,members);
  const changedWhileEditing=!!draft&&base!==rosterKey(members);
  const begin=(random:boolean)=>{setBase(rosterKey(members));setDraft(random||!saved?randomInformation(members):{...structuredClone(saved),information:{...structuredClone(saved.information),roster:rosterKey(members)}});onEditingChange(true);};
  const cancel=()=>{setDraft(null);onEditingChange(false);};
  const changeInfo=(info:InformationSetup)=>setDraft({...draft!,information:info});
  const options=members.map(m=><option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>);
  return <section className="space-y-4 rounded-3xl border border-violet-400/30 p-5">
    <h2 className="text-xl font-bold">시작 전 비밀 정보 설정</h2>
    <p className="text-sm leading-6 text-zinc-400">이야기꾼 전용입니다. 무작위 초안을 만든 뒤 원하는 항목을 수정하고 저장하세요. 실제 전달은 밤 시트의 해당 차례에서 다시 확인합니다.</p>
    <div className="flex flex-wrap gap-3"><button disabled={busy||roleErrors.length>0} className={button} onClick={()=>begin(true)}>전체 무작위 초안 만들기</button>{!draft&&saved&&<button disabled={busy||roleErrors.length>0} className={button} onClick={()=>begin(false)}>저장한 설정 수정</button>}</div>
    {roleErrors.length>0&&<p className="text-sm text-amber-200">먼저 참가자 역할 구성을 저장해 주세요.</p>}
    {draft&&<p className="text-sm text-violet-200">편집 중 · 저장하기 전까지 적용되지 않습니다.</p>}
    {visible&&<fieldset disabled={!draft||busy||changedWhileEditing} className="space-y-5">
      <div><h3 className="font-bold">악마에게 보여줄 미사용 역할 3개</h3><p className="mt-1 text-xs text-zinc-400">주정뱅이가 믿는 주민 역할도 제외합니다. 초기 악마 정보는 7명 이상일 때 전달합니다.</p><div className="grid gap-3 sm:grid-cols-3">{[0,1,2].map(i=><label key={i} className="text-sm">블러프 {i+1}<select className={field} value={visible.information.bluffs[i]??''} onChange={e=>changeInfo({...draft!.information,bluffs:[0,1,2].map(j=>j===i?e.target.value:draft!.information.bluffs[j])})}><option value="">역할 선택</option>{bluffOptions(members).map(r=><option key={r.name}>{r.name}</option>)}</select></label>)}</div></div>
      <label className="block text-sm">점쟁이의 허상 · 게임 동안 고정<select className={field} value={visible.red_herring??''} onChange={e=>setDraft({...draft!,red_herring:e.target.value})}><option value="">선한 참가자 선택</option>{members.filter(m=>['주민','외지인'].includes(roleType(m.actual_role??'')??'')).map(m=><option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>)}</select></label>
      {members.filter(m=>registrationOptions(m).length>0).map(m=><label key={m.user_id} className="block text-sm"><ClocktowerName member={m}/> · {m.actual_role}의 위장 기본값<select className={field} value={visible.information.registrations[m.user_id]??''} onChange={e=>changeInfo({...draft!.information,registrations:{...draft!.information.registrations,[m.user_id]:e.target.value}})}><option value="">실제 역할로 감지</option>{registrationOptions(m).map(r=><option key={r.name}>{r.name}</option>)}</select><span className="mt-2 block text-xs text-zinc-400">능력으로 감지될 때의 기본 제안에만 사용합니다. 취함·중독이면 위장 능력이 없으며, 감지할 때마다 전달 답안을 바꿀 수 있습니다.</span></label>)}
      {members.filter(m=>clueTypes[m.shown_role??'']).map(m=>{const clue=visible.information.clues[m.user_id]??{role:'',correct:'',decoy:''};const update=(values:Partial<typeof clue>)=>changeInfo({...draft!.information,clues:{...draft!.information.clues,[m.user_id]:{...clue,...values}}});return <div key={m.user_id} className="space-y-3 rounded-2xl border border-white/10 p-4"><h3 className="font-bold"><ClocktowerName member={m}/> · {m.shown_role}</h3>{m.actual_role==='주정뱅이'&&<p className="text-xs text-amber-200">실제 주정뱅이: 실제 역할과 다른 정보 조합도 저장할 수 있습니다.</p>}{m.shown_role==='사서'&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={!!clue.none} onChange={e=>update({none:e.target.checked})}/>외지인 0명으로 전달</label>}{!clue.none&&<div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">알려줄 역할<select className={field} value={clue.role} onChange={e=>update({role:e.target.value})}><option value="">역할 선택</option>{setupRoles.filter(r=>r.type===clueTypes[m.shown_role!]).map(r=><option key={r.name}>{r.name}</option>)}</select></label><label className="text-sm">정답으로 감지할 사람<select className={field} value={clue.correct} onChange={e=>update({correct:e.target.value})}><option value="">참가자 선택</option>{options}</select></label><label className="text-sm">함께 보여줄 오인 대상<select className={field} value={clue.decoy} onChange={e=>update({decoy:e.target.value})}><option value="">참가자 선택</option>{options}</select></label></div>}<p className="text-xs text-zinc-400">멤버에게는 두 사람 중 누가 정답인지 표시하지 않습니다.</p></div>;})}
    </fieldset>}
    {errors.length>0&&<ul className="space-y-1 text-sm text-amber-200">{errors.map(error=><li key={error}>{error}</li>)}</ul>}
    {changedWhileEditing&&<p className="text-sm text-amber-200">편집 중 역할 구성이 변경되었습니다. 취소 후 설정을 다시 열어 주세요.</p>}
    {draft?<div className="flex gap-3"><button disabled={busy||errors.length>0||changedWhileEditing} className="rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-40" onClick={async()=>{if(await save(draft))cancel();}}>비밀 정보 저장</button><button disabled={busy} className={button} onClick={cancel}>취소</button></div>:saved&&errors.length===0&&<p className="text-sm text-emerald-300">비밀 정보 저장 완료 · 밤 차례에서 확인하고 전달합니다.</p>}
  </section>;
}
