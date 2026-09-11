export function clocktowerPlayTitle(number: number): string {
  const ordinals = ["첫", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열한", "열두", "열세", "열네", "열다섯", "열여섯", "열일곱", "열여덟", "열아홉", "스무"];
  return `${ordinals[number - 1] ?? number}번째 시계탑에 흐른 피`;
}
