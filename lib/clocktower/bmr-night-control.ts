import type { BmrAuto } from './bmr-engine';

// A new night always needs an explicit start, even after a page reload.
export function bmrNightPlayback(engine:BmrAuto|undefined,night:number):'waiting'|'running'|'paused' {
 if(!engine||engine.night!==night||engine.nightPlayback?.night!==night)return 'waiting';
 return engine.nightPlayback.status;
}

export function setBmrNightPlayback(engine:BmrAuto,status:'running'|'paused'):BmrAuto {
 if(engine.phase!=='NIGHT'||engine.finished)throw Error('진행할 밤 능력이 없습니다.');
 if(engine.review)throw Error('결과 검토 중에는 자동 진행이 멈춰 있습니다.');
 // Control changes must never resend the last request, notice or result.
 return {...engine,nightPlayback:{night:engine.night,status},out:{notices:[]}};
}
