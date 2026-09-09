import type { LiveState } from './live';
export function phaseAnnouncement(state:LiveState) {
  const r=state.room;if(!r||r.phase==='SETUP')return null;
  const voting=r.phase==='DAY'&&r.day_activity==='VOTING';
  const discussion=r.phase==='DAY'&&!voting&&(r.activity_revision??0)>0;
  return {key:`${r.id}:${r.night}:${r.phase}:${r.activity_revision??0}`,title:r.phase==='NIGHT'?'밤이 시작되었습니다':r.phase==='ENDED'?'게임이 종료되었습니다':voting?'투표가 시작되었습니다':discussion?'토론을 재개합니다':'낮이 시작되었습니다',icon:r.phase==='NIGHT'?'☾':r.phase==='ENDED'?'⚑':voting?'✓':'☀',description:r.phase==='NIGHT'?'휴대폰 화면을 계속 확인해 주세요. 공통 미션과 개인 요청이 도착하면 팝업으로 안내합니다.':r.phase==='ENDED'?'모든 진행이 끝났습니다. 이야기꾼의 안내를 들어 주세요.':voting?'이야기꾼의 안내에 따라 현장에서 투표해 주세요.':'고개를 들고 이야기를 나눠 주세요. 공개된 생존 상태도 확인할 수 있습니다.'};
}
