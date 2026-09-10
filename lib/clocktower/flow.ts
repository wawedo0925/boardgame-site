import type {LiveState} from './live';
export function flowLabel(s:LiveState) {
 const r=s.room;if(!r)return '';
 if(r.phase==='SETUP')return r.roles_released?'역할 확인':'역할·비밀 정보 준비';
 if(r.phase==='NIGHT')return `${r.night}일차 밤`;
 if(r.phase==='ENDED')return r.winner==='GOOD'?'선한 팀 승리':r.winner==='EVIL'?'악한 팀 승리':'게임 종료';
 return r.day_stage==='NOMINATIONS'?'전체 토론·지목':'밀담';
}
export function nextFlowLabel(s:LiveState) {
 const r=s.room!;
 if(r.phase==='SETUP')return r.roles_released?'첫날 밤 시작':'역할 배포 · 확인 시작';
 if(r.phase==='NIGHT')return '낮 시작 · 밀담';
 return r.day_stage==='NOMINATIONS'?'처형 확정 · 다음 밤':'전체 토론·지목 시작';
}
