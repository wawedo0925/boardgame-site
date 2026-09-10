import type { LiveState } from './live';
import {flowLabel} from './flow';
export function phaseAnnouncement(state:LiveState) {
 const r=state.room;if(!r||r.phase==='SETUP')return null;
 return {key:`${r.id}:${r.night}:${r.phase}:${r.day_stage??'PRIVATE'}:${r.flow_revision??0}`,title:flowLabel(state),icon:r.phase==='NIGHT'?'☾':r.phase==='ENDED'?'⚑':'☀',description:r.phase==='NIGHT'?'밤이 시작되었습니다. 공통 미션 중에도 개인 능력 요청이 우선 표시됩니다.':r.phase==='ENDED'?(r.end_reason??'이야기꾼의 안내를 들어 주세요.'):r.day_stage==='NOMINATIONS'?'모두 모여 토론하세요. 마을 자리에서 멤버를 선택해 지목할 수 있습니다.':'낮이 시작되었습니다. 공개된 생존 상태를 확인하고 자유롭게 밀담을 나누세요.'};
}
