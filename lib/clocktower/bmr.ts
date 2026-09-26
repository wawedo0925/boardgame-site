import { CLOCKTOWER_CHARACTERS } from './characters';
import { composition, shuffle } from './setup';
import type { LiveMember, LiveVote } from './live';

export const BMR_ROLES = CLOCKTOWER_CHARACTERS['피로 물든 달'].filter(r => r.type !== '이야기꾼' && r.name !== '건달(악)').map(r => ({...r, name:r.name === '좀버얼' ? '좀비얼' : r.name}));
export const BMR_FIRST = ['황혼','하수인 정보','미치광이','악마 정보','선원','궁정대신','대부','악마의 변호사','푸카','할머니','객실 청소부','새벽'];
export const BMR_OTHER = ['황혼','선원','여관 주인','궁정대신','도박사','악마의 변호사','미치광이','구마사제','좀비얼','푸카','샤발로스','포','암살자','대부','교수','험담꾼','땜장이','달의 자손','할머니','객실 청소부','새벽'];
export const bmrOrder = (night:number) => night === 1 ? BMR_FIRST : BMR_OTHER;
export type BmrMemberState = { life:'ALIVE'|'DEAD'|'ZOMBIE'; faction:'GOOD'|'EVIL'; drunk:boolean; poisoned:boolean; protected:boolean; spent:boolean };
export type BmrState = { cursor:number; notes:string; completed:boolean; history?:{night:number;step:string;note:string}[] };
export type BmrRequestOptions = { character?:boolean; pass?:boolean; living?:boolean; dead?:boolean };
export const BMR_HINTS:Record<string,string> = {
 '황혼':'확인: 지난 효과의 만료, 원인 캐릭터의 사망·취함·중독, 낮의 사망·처형, 지속 효과를 마도서에서 갱신하세요. 표시는 자동 해제되지 않습니다.',
 '하수인 정보':'7명 이상: 각 하수인에게 악마가 누구인지 전달하세요. 미치광이는 실제 악마가 아닙니다.',
 '악마 정보':'7명 이상: 실제 악마에게 하수인과 게임에 없는 선한 캐릭터 3개를 알려 주세요. 미치광이가 있다면 그 사람과 선택도 따로 알려 주세요.',
 '미치광이':'실제 역할을 노출하지 말고 본인이 믿는 악마에 맞춰 요청하세요. 첫 밤의 가짜 하수인·블러프는 이야기꾼이 정합니다. 이후 선택은 실제 악마에게 전달하며 실제 사망 효과는 없습니다.',
 '선원':'생존자 1명(본인 가능). 선원 또는 대상 중 한 명을 다음 황혼까지 취하게 합니다. 건강한 선원은 사망하지 않습니다. 건달을 처음 선택했다면 취함과 진영 변경을 먼저 확인하세요.',
 '여관 주인':'첫 밤 제외, 2명 선택. 오늘 밤 사망에서 보호하고 한 명을 다음 황혼까지 취하게 합니다. 여관 주인 자신이 취하면 보호가 무효일 수 있습니다.',
 '궁정대신':'게임당 1번, 플레이어가 아니라 캐릭터 선택. 즉시 3일 밤·3일 낮 동안 취함. 없는 캐릭터도 선택 가능하며 취함·중독 중 시도도 소모됩니다. 원인의 사망·능력 무효와 남은 기간을 메모하세요.',
 '도박사':'첫 밤 제외. 플레이어 1명과 추측 캐릭터 선택. 틀리면 도박사가 사망합니다. 맞았는지는 알려주지 않습니다. 자기 자신·사망자도 선택 가능합니다.',
 '악마의 변호사':'생존자 1명, 전날과 다른 대상. 다음 낮의 처형 사망만 보호합니다. 사망 위장 중인 좀비얼도 실제로 생존해 있다면 대상이 될 수 있습니다.',
 '구마사제':'첫 밤 제외. 전날과 다른 1명. 실제 악마라면 구마사제의 신원을 알려주고 악마 자신의 능력 사용을 위한 깨움을 건너뜁니다. 푸카의 기존 중독 사망 등 지속 효과는 따로 판정하세요.',
 '좀비얼':'첫 밤 제외. 오늘 낮에 아무도 사망하지 않았을 때만 1명 공격. 첫 사망은 실제 사망 대신 사망 위장으로 표시합니다. 위장 중 지목·생존자 수·유령표는 사망자로 취급하고 악마 생존 판정은 따로 합니다.',
 '푸카':'첫 밤부터 새 대상 1명을 중독. 두 번째 밤부터 이전 중독자는 새 선택 뒤 사망하고 건강해집니다. 사망 판정 시점까지는 중독입니다. 푸카의 취함·사망·구마사제 영향을 따로 확인하세요.',
 '샤발로스':'첫 밤 제외. 지난 밤 공격한 사망자 1명을 먼저 부활시킬 수 있고, 이번 밤 서로 다른 2명을 순서대로 공격합니다. 부활 시 능력 사용 이력을 갱신하세요.',
 '포':'첫 밤 제외. 1명 또는 공격 쉬기. 지난 행동에서 쉬었다면 서로 다른 3명을 반드시 선택합니다. 첫 밤에 행동하지 않은 것과 구마사제 때문에 못 깬 것은 충전이 아닙니다.',
 '암살자':'첫 밤 제외, 게임당 1번. 모든 사망 보호를 뚫지만 암살자 자신의 취함·중독은 여전히 무효이며 시도는 소모됩니다. 건달 선택에 따른 취함도 확인하세요.',
 '대부':'첫 밤에는 참여 중인 외지인 캐릭터를 전달합니다. 이후에는 오늘 낮 외지인이 사망했다면 1명 공격합니다. 준비 구성은 외지인 −1 또는 +1입니다.',
 '교수':'첫 밤 제외, 게임당 1번. 사망자 1명 선택, 실제 주민이면 부활. 부활한 사람은 능력을 다시 얻고, 남은 밤 순서에 따라 첫 정보도 처리해야 합니다. 추가 요청으로 처리하세요.',
 '험담꾼':'낮에 공개한 발언이 참이고 밤 판정 시 능력이 유효하면 이야기꾼이 1명을 죽입니다. 공개 발언·참거짓·대상은 진행 메모에 기록하세요.',
 '땜장이':'이야기꾼이 언제든 사망시킬 수 있지만 보호·취함·중독을 확인하세요. 무조건 사망시킬 필요는 없습니다.',
 '달의 자손':'사망을 알게 된 뒤 공개적으로 생존자 1명을 선택합니다. 선택 시 선한 팀이면 밤에 사망. 밤 사망을 새벽에 안 경우 다음 낮에 선택하고 다음 밤에 처리합니다. 선택 시 진영과 밤 판정 시 능력 상태를 따로 확인하세요.',
 '할머니':'첫 밤에는 선한 손주 1명과 실제 캐릭터를 전달합니다. 이후 악마가 손주를 죽였다면 할머니도 사망할 수 있습니다. 손주가 다른 원인으로 죽은 것은 해당하지 않습니다.',
 '객실 청소부':'자신 제외 생존자 2명. 오늘 밤 자신의 능력을 쓰려고 깬 사람 수를 전달합니다. 다른 능력 때문에 깬 것과 초기 악한 팀 정보는 제외합니다. 취함·중독 중 깬 것도 세며, 객실 청소부가 무효 상태라면 정보를 조정합니다.',
 '새벽':'사망·부활·진영·지속 효과를 다시 확인하세요. 전달한 결과와 공통 미션을 모두 확인한 후 낮으로 넘어가면 사망 상태가 공개됩니다. 승리는 주모자·좀비얼 등의 예외를 확인하고 직접 확정합니다.',
 '음유시인':'하수인이 처형으로 사망하면 다른 모든 플레이어가 다음 황혼까지 취합니다. 처형만 되고 살아남은 경우는 해당하지 않습니다.',
 '찻집 여인':'가장 가까운 양쪽 생존 이웃이 모두 선하면 두 사람은 사망하지 않습니다. 사망·부활·진영 변경마다 이웃을 다시 확인하세요. 암살자는 보호를 무시합니다.',
 '평화주의자':'선한 플레이어가 처형될 때 이야기꾼이 생존시킬 수 있습니다. 처형 자체는 일어났습니다.',
 '어릿광대':'처음 실제로 사망할 상황에서 생존하고 능력을 소모합니다. 다른 보호로 이미 막혔다면 소모하지 않습니다. 취함·중독 중 첫 사망은 막지 못합니다.',
 '건달':'매일 밤 처음 능력으로 선택한 사람을 다음 황혼까지 취하게 하고 그 사람의 팀으로 변경합니다. 선택 즉시 처리하며 이후 선택은 다시 발동하지 않습니다. 실제 진영을 마도서에서 수정하세요.',
 '주모자':'악마가 처형으로 실제 사망하면 하루 더 진행합니다. 그 다음 날 처형된 사람의 팀이 패배하며, 아무도 처형하지 않으면 선이 승리합니다. 좀비얼의 첫 사망 위장은 실제 사망이 아닙니다.',
};
export function bmrPreset(role:string,night:number,charged=false):{count:number;self:boolean;options:BmrRequestOptions;prompt:string} {
 const count=['대부','미치광이'].includes(role)&&night===1||['황혼','하수인 정보','악마 정보','할머니','새벽','험담꾼','땜장이','달의 자손'].includes(role)?0:role==='궁정대신'?0:['여관 주인','샤발로스','객실 청소부'].includes(role)?2:role==='포'&&charged?3:1;
 const options:BmrRequestOptions={character:['궁정대신','도박사'].includes(role),pass:['궁정대신','교수','암살자'].includes(role)||(role==='포'&&!charged),living:['선원','객실 청소부','악마의 변호사'].includes(role),dead:role==='교수'};
 return {count,self:role!=='객실 청소부',options,prompt:options.character?'능력을 사용할 대상과 캐릭터를 선택해 주세요.':count?'능력을 사용할 참가자를 선택해 주세요.':'도착한 안내를 확인해 주세요.'};
}
export function bmrSetupErrors(members:LiveMember[]):string[] {
 const errors:string[]=[]; const base=composition(members.length,false);
 if(!base)return ['플레이어 5~15명을 배정해 주세요.'];
 const roles=members.map(m=>BMR_ROLES.find(r=>r.name===m.actual_role));
 if(roles.some(r=>!r))errors.push('모든 참가자의 역할을 배정해 주세요.');
 if(new Set(members.map(m=>m.actual_role)).size!==members.length)errors.push('실제 역할은 중복할 수 없습니다.');
 if(members.some(m=>m.actual_role==='미치광이'?!BMR_ROLES.some(r=>r.name===m.shown_role&&r.type==='악마'):m.shown_role!==m.actual_role))errors.push('미치광이에게는 악마 역할을 표시하고 나머지는 실제 역할과 같아야 합니다.');
 const counts=['주민','외지인','하수인','악마'].map(t=>roles.filter(r=>r?.type===t).length);
 const expected=base;
 const adjustments=members.some(m=>m.actual_role==='대부')?[-1,1]:[0];
 if(!adjustments.some(d=>counts[0]===expected[0]-d&&counts[1]===expected[1]+d&&counts[2]===expected[2]&&counts[3]===1))errors.push(`기본 구성 주민 ${expected[0]} / 외지인 ${expected[1]} / 하수인 ${expected[2]} / 악마 1${adjustments.length>1?'에서 대부의 외지인 −1 또는 +1 조정':''}을 확인하세요.`);
 return errors;
}
export function bmrExecutionCandidate(votes:LiveVote[]):string|null {
 const done=votes.filter(v=>v.status==='DONE');const top=Math.max(0,...done.map(v=>Object.values(v.ballots).filter(Boolean).length));
 const leaders=done.filter(v=>Object.values(v.ballots).filter(Boolean).length===top);
 return leaders.length===1&&top>=leaders[0].threshold?leaders[0].nominee:null;
}

export function bmrRandomRoles(members:LiveMember[],random=Math.random):LiveMember[] {
 const base=composition(members.length,false);if(!base)return members;
 const minions=shuffle(BMR_ROLES.filter(r=>r.type==='하수인'),random).slice(0,base[2]);
 const adjustment=minions.some(r=>r.name==='대부')?(base[1]===0?1:random()<0.5?-1:1):0;
 const selected=[...shuffle(BMR_ROLES.filter(r=>r.type==='주민'),random).slice(0,base[0]-adjustment),...shuffle(BMR_ROLES.filter(r=>r.type==='외지인'),random).slice(0,base[1]+adjustment),...minions,...shuffle(BMR_ROLES.filter(r=>r.type==='악마'),random).slice(0,1)];
 const shuffled=shuffle(selected,random);return members.map((m,i)=>({...m,actual_role:shuffled[i].name,shown_role:shuffled[i].name==='미치광이'?selected.find(r=>r.type==='악마')!.name:shuffled[i].name}));
}
export function bmrInformationDraft(step:string,members:LiveMember[]):string {
 const demons=members.filter(m=>BMR_ROLES.find(r=>r.name===m.actual_role)?.type==='악마');
 const minions=members.filter(m=>BMR_ROLES.find(r=>r.name===m.actual_role)?.type==='하수인');
 if(step==='하수인 정보')return members.length<7?'7명 미만으로 초기 악한 팀 정보가 없습니다.':`악마: ${demons.map(m=>m.name).join(', ')}`;
 if(step==='악마 정보')return members.length<7?'7명 미만으로 초기 악한 팀 정보가 없습니다.':`하수인: ${minions.map(m=>m.name).join(', ')}\n게임에 없는 선한 캐릭터: ${BMR_ROLES.filter(r=>['주민','외지인'].includes(r.type)&&!members.some(m=>m.actual_role===r.name)).slice(0,3).map(r=>r.name).join(', ')}${members.some(m=>m.actual_role==='미치광이')?'\n미치광이: '+members.find(m=>m.actual_role==='미치광이')!.name:''}`;
 if(step==='대부')return '참여 중인 외지인: '+(members.filter(m=>BMR_ROLES.find(r=>r.name===m.actual_role)?.type==='외지인').map(m=>m.actual_role).join(', ')||'없음');
 return '';
}
