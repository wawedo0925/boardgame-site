export const CLOCKTOWER_DIFFICULTIES = ["점철되는 혼란", "피로 물든 달", "화단에 꽃피운 이단", "캐러셀"] as const;

export type ClocktowerDifficulty = (typeof CLOCKTOWER_DIFFICULTIES)[number];
export type ClocktowerCharacterType = "이야기꾼" | "주민" | "외지인" | "하수인" | "악마";
export type ClocktowerFaction = "중립" | "선" | "악";
export type ClocktowerCharacter = { name: string; type: ClocktowerCharacterType; faction: ClocktowerFaction };

const make = (type: ClocktowerCharacterType, faction: ClocktowerFaction, names: string): ClocktowerCharacter[] =>
  names.split(",").map(name => name.trim()).filter(Boolean).map(name => ({ name, type, faction }));

export const CLOCKTOWER_CHARACTERS: Record<ClocktowerDifficulty, ClocktowerCharacter[]> = {
  "점철되는 혼란": [
    ...make("이야기꾼", "중립", "이야기꾼"),
    ...make("주민", "선", "세탁부,사서,수사관,요리사,초공감자,점쟁이,장의사,수도사,까마귀지기,성결자,처단자,군인,시장"),
    ...make("외지인", "선", "집사,주정뱅이,은둔자,성자"),
    ...make("하수인", "악", "독살범,첩자,남작,탕녀"),
    ...make("악마", "악", "임프"),
  ],
  "피로 물든 달": [
    ...make("이야기꾼", "중립", "이야기꾼"),
    ...make("주민", "선", "할머니,선원,객실 청소부,구마사제,여관 주인,도박사,험담꾼,궁정대신,교수,음유시인,찻집 여인,평화주의자,어릿광대"),
    ...make("외지인", "선", "미치광이,땜장이,달의 자손"),
    ...make("하수인", "악", "건달,대부,악마의 변호사,암살자,주모자"),
    ...make("악마", "악", "좀버얼,푸카,샤발로스,포"),
  ],
  "화단에 꽃피운 이단": [
    ...make("이야기꾼", "중립", "이야기꾼"),
    ...make("주민", "선", "시계공,꿈꾸는자,뱀조련사,수학자,꽃팔이소녀,포고꾼,예언자,백치천재,재봉사,철학자,화가,곡예사,현자"),
    ...make("외지인", "선", "변종,이발사,사랑꾼,얼뜨기"),
    ...make("하수인", "악", "마녀,세레노버스,마귀할멈,사악한 쌍둥이"),
    ...make("악마", "악", "팡구,비고르 모르티스,노다시,보르톡스"),
  ],
  "캐러셀": [...make("이야기꾼", "중립", "이야기꾼")],
};

export function clocktowerDifficultyFromTitle(title: string): ClocktowerDifficulty | null {
  return CLOCKTOWER_DIFFICULTIES.find(value => title.includes(value)) ?? null;
}
