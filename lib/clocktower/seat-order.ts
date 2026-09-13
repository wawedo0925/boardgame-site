type Seat = {user_id:string;seat:number};

export function clickedSeatOrder(base: Record<string,number>, selected: string[]) {
  const remaining=Object.keys(base).sort((a,b)=>base[a]-base[b]).filter(id=>!selected.includes(id));
  return Object.fromEntries([...selected,...remaining].map((id,index)=>[id,index+1]));
}

export function seatOrderSwaps<T extends Seat>(members:T[], desired:Record<string,number>):[T,T][] {
  const current=members.map(m=>({...m}));
  const plan:[T,T][]=[];
  for(const member of [...current].sort((a,b)=>desired[a.user_id]-desired[b.user_id])) {
    const first=current.find(m=>m.user_id===member.user_id)!;
    if(first.seat===desired[first.user_id])continue;
    const second=current.find(m=>m.seat===desired[first.user_id]);
    if(!second)throw new Error('자리 순서를 다시 확인해 주세요.');
    plan.push([{...first},{...second}]);
    [first.seat,second.seat]=[second.seat,first.seat];
  }
  return plan;
}
