export type ParticipationEvent = {
  id: string;
  started_at: string;
  event_kind?: string | null;
  attendance_status?: string | null;
};

function seoulDate(value:string) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const part=(type:string)=>parts.find(item=>item.type===type)?.value??'';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function participationEventCount(events:ParticipationEvent[]) {
  const units=new Set<string>();
  for(const event of events) {
    if(event.attendance_status==='ABSENT')continue;
    units.add(event.event_kind==='CLOCKTOWER'?`CLOCKTOWER:${seoulDate(event.started_at)}`:`EVENT:${event.id}`);
  }
  return units.size;
}
