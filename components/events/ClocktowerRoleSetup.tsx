"use client";
import { useEffect, useState } from 'react';
import { changeRole, composition, groups, randomAssignments, roleType, setupRoles, validateAssignments, type Assignment } from '@/lib/clocktower/setup';
import type { LiveMember } from '@/lib/clocktower/live';
import { ClocktowerName } from './ClocktowerSeating';

const button='rounded-xl border border-white/20 px-4 py-3 text-sm disabled:opacity-40';
const field='mt-2 w-full rounded-xl border border-white/15 bg-zinc-900 p-3';
export default function ClocktowerRoleSetup({members,busy,save,onEditingChange}:{members:LiveMember[];busy:boolean;save:(rows:Assignment[],expected:Assignment[])=>Promise<boolean>;onEditingChange:(value:boolean)=>void}) {
  const saved=members.map(m=>({user_id:m.user_id,actual_role:m.actual_role??'',shown_role:m.shown_role??''}));
  const [draft,setDraft]=useState<Assignment[]|null>(null);
  const [base,setBase]=useState<Assignment[]>([]);
  const [baron,setBaron]=useState<'random'|'include'|'exclude'>('random');
  const rows=draft??saved;
  const errors=validateAssignments(rows);
  const counts=composition(rows.length,rows.some(r=>r.actual_role==='남작'));
  useEffect(()=>()=>onEditingChange(false),[onEditingChange]);
  const begin=()=>{setBase(saved);setDraft(saved);onEditingChange(true);};
  const cancel=()=>{setDraft(null);onEditingChange(false);};
  return <section className="rounded-3xl border border-violet-400/30 p-5">
    <h2 className="text-xl font-bold">역할 구성 · {members.length}명</h2>
    <p className="mt-2 text-sm leading-6 text-zinc-400">점철되는 혼란 · 이야기꾼 제외 5~15명. 배정안은 저장하기 전까지 적용되지 않으며, 저장한 역할도 첫날 밤에 각자에게 공개됩니다.</p>
    {counts&&<div className="mt-4 flex flex-wrap gap-2">{groups.map((g,i)=><span key={g} className="rounded-lg bg-white/5 px-3 py-2 text-sm">{g} {rows.filter(r=>roleType(r.actual_role)===g).length} / {counts[i]}</span>)}</div>}
    {rows.some(r=>r.actual_role==='남작')&&<p className="mt-3 text-sm text-amber-200">남작 포함: 기본 구성에서 주민 −2명 · 외지인 +2명</p>}
    {!draft?<button disabled={busy||!counts} className={`${button} mt-4`} onClick={begin}>역할 배정안 편집</button>:<>
      <fieldset disabled={busy} className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm">자동 배정 시 남작<select className={field} value={baron} onChange={e=>setBaron(e.target.value as typeof baron)}><option value="random">무작위</option><option value="include">반드시 포함</option><option value="exclude">제외</option></select></label><button className={button} onClick={()=>setDraft(randomAssignments(rows.map(r=>r.user_id),baron))}>전체 무작위 배정안 만들기</button></div>
        <p className="text-sm text-violet-200">아래에서 직접 역할을 선택하거나 자동 배정안을 수정하세요. 남작을 넣거나 빼면 다른 참가자 최대 2명의 주민·외지인 역할도 함께 바뀝니다. 저장 전 전체 명단을 확인해 주세요.</p>
        <div className="grid gap-3 md:grid-cols-2">{rows.map(row=>{const member=members.find(m=>m.user_id===row.user_id)!;return <div key={row.user_id} className="rounded-2xl border border-white/10 p-4"><h3 className="font-bold">{member.seat}. <ClocktowerName member={member}/></h3><label className="mt-3 block text-sm">실제 역할<select className={field} value={row.actual_role} onChange={e=>setDraft(changeRole(rows,row.user_id,e.target.value))}><option value="">역할 선택</option>{groups.map(g=><optgroup key={g} label={g}>{setupRoles.filter(r=>r.type===g).map(r=><option key={r.name}>{r.name}</option>)}</optgroup>)}</select></label>{row.actual_role==='주정뱅이'&&<label className="mt-3 block text-sm text-amber-200">본인에게 표시할 주민 역할<select className={field} value={row.shown_role} onChange={e=>setDraft(rows.map(r=>r.user_id===row.user_id?{...r,shown_role:e.target.value}:r))}><option value="">주민 선택</option>{setupRoles.filter(r=>r.type==='주민').map(r=><option key={r.name}>{r.name}</option>)}</select></label>}</div>;})}</div>
      </fieldset>
      <div className="mt-4 flex gap-3"><button disabled={busy||errors.length>0} className="rounded-xl bg-violet-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-40" onClick={async()=>{if(await save(rows,base))cancel();}}>배정안 저장</button><button disabled={busy} className={button} onClick={cancel}>취소</button></div>
    </>}
    {errors.length>0?<ul className="mt-4 space-y-1 text-sm text-amber-200" aria-live="polite">{errors.map(e=><li key={e}>{e}</li>)}</ul>:<p className="mt-4 text-sm text-emerald-300">인원 구성과 역할 중복 검증 완료{draft?' · 아직 저장하지 않았습니다.':''}</p>}
  </section>;
}
