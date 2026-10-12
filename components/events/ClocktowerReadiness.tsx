import type { LiveState } from '@/lib/clocktower/live';
import { readiness } from '@/lib/clocktower/readiness';

export default function ClocktowerReadiness({state,editing=[],busy=false}:{state:LiveState;editing?:string[];busy?:boolean}){
 const room=state.room;
 if(!state.is_host||!room||!['SETUP','NIGHT'].includes(room.phase))return null;
 const reasons=readiness(state,editing,busy);
 const action=room.phase==='NIGHT'?'밀담 시작':room.roles_released?'첫날 밤 시작':'역할 배포';
 return <div role="status" className={'mt-3 rounded-xl border p-4 text-sm leading-6 '+(reasons.length?'border-amber-300/25 bg-amber-300/5 text-amber-100':'border-emerald-300/25 bg-emerald-300/5 text-emerald-200')}>
  <p className="font-bold">{reasons.length?action+' 전 확인해 주세요':'준비 완료 · '+action+' 버튼을 누를 수 있어요.'}</p>
  {!!reasons.length&&<ul className="mt-2 list-disc space-y-1 pl-5">{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
 </div>;
}
