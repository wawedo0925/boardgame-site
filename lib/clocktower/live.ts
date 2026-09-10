import type { NightEngine } from './night';
export type LiveVote={id:string;day:number;nominator:string;nominee:string;status:'WAITING'|'RUNNING'|'DONE'|'CANCELLED';voter_order:string[];started_at:string|null;threshold:number;ballots:Record<string,boolean>};
export type SeatLayout = Record<string, { x: number; y: number }>;
export type LiveMember = { role_confirmed?:boolean; ghost_vote_used?:boolean; user_id: string; name: string; birth_year?: string | null; seat: number; alive: boolean; actual_role?: string; shown_role?: string; notes?: string };
export type LiveRequest = { id: string; user_id: string; night: number; prompt: string; target_count: number; allow_self: boolean; status: 'OPEN' | 'SUBMITTED' | 'RESOLVED' | 'CANCELLED'; targets: string[]; result: string; acknowledged: boolean };
export type LiveMission={id:string;round:number;kind:'NUMBERS'|'TEXT';challenge:{tiles?:number[];text?:string};completed:boolean};
export type LiveShot={id:string;actor:string;target:string;status:"PENDING"|"DONE";killed:boolean};
export type LiveState = { shots?:LiveShot[]; votes?:LiveVote[];server_now?:string;clock_offset?:number;ghost_vote_used?:boolean; missions?:LiveMission[]; mission_progress?:{user_id:string;completed:number;total:number}[];engine?: NightEngine; engine_version?: number; room: { roles_released?:boolean;day_stage?:'PRIVATE'|'NOMINATIONS';flow_revision?:number;winner?:'GOOD'|'EVIL'|null;end_reason?:string|null; id: string; phase: 'SETUP' | 'NIGHT' | 'DAY' | 'ENDED'; night: number; day_activity?:'DISCUSSION'|'VOTING';activity_revision?:number;seating_layout?: SeatLayout; seating_revision?: number } | null; can_create?: boolean; waiting?: boolean; is_host?: boolean; my_id?: string; members?: LiveMember[]; candidates?: { user_id: string; name: string; birth_year?: string | null }[]; requests?: LiveRequest[] };

// Selection helpers only: the storyteller determines timing and adjudication.
// References: https://wiki.bloodontheclocktower.com/Trouble_Brewing
export function nightPreset(role: string, night: number) {
  if (role === '점쟁이') return { count: 2, self: true, prompt: '확인할 참가자 두 명을 선택해 주세요.', hint: '오인 대상·중독·취함·역할의 등록 예외를 확인한 뒤 예/아니요를 전달하세요.' };
  if (role === '독살범') return { count: 1, self: true, prompt: '능력을 사용할 참가자 한 명을 선택해 주세요.', hint: '중독 상태는 이야기꾼 메모에 직접 기록하세요. 능력의 실제 성공 여부는 알려주지 않습니다.' };
  if (role === '수도사') return { count: 1, self: false, prompt: '보호할 다른 참가자 한 명을 선택해 주세요.', hint: night === 1 ? '첫날 밤에는 능력을 사용하지 않습니다.' : '보호와 중독·취함 여부를 직접 판정하세요.' };
  if (role === '임프') return { count: 1, self: true, prompt: '능력을 사용할 참가자 한 명을 선택해 주세요.', hint: night === 1 ? '첫날 밤에는 공격하지 않습니다. 악마 정보와 블러프를 별도로 전달하세요.' : '보호·군인·시장·자살에 따른 역할 이전 등은 이야기꾼이 판정하세요. 사망은 낮 시작 때 공개됩니다.' };
  if (role === '집사') return { count: 1, self: false, prompt: '주인으로 정할 다른 참가자 한 명을 선택해 주세요.', hint: '주인은 이야기꾼 메모에 기록하고, 낮 투표 조건을 현장에서 안내하세요.' };
  if (role === '까마귀지기') return { count: 1, self: true, prompt: '역할을 확인할 참가자 한 명을 선택해 주세요.', hint: '밤에 사망해서 능력이 발동한 경우에만 요청하세요. 사망자도 대상 선택이 가능합니다.' };
  const hint = role === '첩자' ? '마도서 정보를 직접 확인·편집한 뒤 전달하세요. 중독이면 보여줄 정보도 조정하세요.'
    : ['세탁부','사서','수사관','요리사'].includes(role) && night > 1 ? '첫날 밤 정보를 받는 역할입니다. 추가 전달이 필요한지 확인하세요.'
    : role === '장의사' ? '첫날 밤에는 정보가 없습니다. 낮에 처형으로 사망한 사람이 있는지 확인하세요.'
    : ['성결자','처단자','군인','시장','주정뱅이','은둔자','성자','남작','탕녀'].includes(role) ? '정기적인 대상 선택이 없는 역할입니다. 필요한 정보나 역할 변경만 전달하세요.'
    : '역할에 맞는 정보를 입력해서 보내세요. 실제 정보와 예외 판정은 이야기꾼이 결정합니다.';
  return { count: 0, self: true, prompt: '', hint };
}
