import type { LiveMember, LiveRequest } from '@/lib/clocktower/live';
import { eligible, type NightEngine } from '@/lib/clocktower/night';

export default function ClocktowerNightTimeline({engine,members,current}:{engine:NightEngine;members:LiveMember[];current?:LiveRequest}) {
  const groups=[...new Set(engine.tasks.map(t=>t.role))];
  return <div className="space-y-3 rounded-2xl border border-white/15 p-4">
    <h3 className="font-bold">{engine.night}번째 밤 진행 현황 · 이야기꾼 전용</h3>
    <ol className="space-y-3">{groups.map((role,index)=><li key={role} className="space-y-2">
      <h4 className="text-sm text-violet-200">{index+1}. {role}</h4>
      {engine.tasks.map((task,i)=>{
        if(task.role!==role)return null;
        const member=members.find(m=>m.user_id===task.user_id);
        const saved=engine.timeline?.[task.key];
        const active=!engine.finished&&i===engine.cursor;
        const passed=engine.finished||i<engine.cursor;
        const actor=saved?.actor??`${member?.actual_role||role}(${member?.name??'참가자'})`;
        const status=active?(current?.status==='CANCELLED'?'건너뜀':current?.status==='RESOLVED'?(current.acknowledged?'확인 완료':role==='첩자'?'마도서 확인 중':'전달한 결과 확인 중'):current?.status==='SUBMITTED'?'이야기꾼 검토 중':current?.status==='OPEN'?(current.target_count?'멤버 선택 중':'정보 요청 중'):'요청 준비 중'):saved?'전달 완료':passed?'건너뜀 또는 이전 처리 완료':eligible(task,engine,members)?'진행 전':'진행 전 · 발동 조건 충족 시 진행';
        return <div key={task.key} aria-current={active?'step':undefined} className={`rounded-xl p-3 text-sm leading-6 ${active?'border-2 border-violet-300 bg-violet-400/15 font-bold text-white':'bg-white/5 text-zinc-300'}`}>
          <p>{actor}{member?.actual_role==='주정뱅이'?` · ${role}로 진행`:''} · {status}</p>
          {saved&&<div className="mt-1 whitespace-pre-wrap">
            {saved.targets.length>0&&<p>선택: {saved.targets.join(', ')}</p>}
            {saved.effect&&<p>반영: {saved.effect}</p>}
            <p>전달: {saved.result}</p>
          </div>}
        </div>;
      })}
    </li>)}</ol>
  </div>;
}
