export const KOREAN_INITIALS=['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'] as const;
export function initialRange(initial:string) {
  const index=KOREAN_INITIALS.findIndex(value=>value===initial);
  return index<0?null:{start:String.fromCharCode(0xac00+index*588),end:String.fromCharCode(0xac00+(index+1)*588)};
}
