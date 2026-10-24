export type Pet = 0 | 1;
export function scoreChoices(queue: number[], choices: number[]) {
  return choices.reduce((score, pet, i) => Math.max(0, score + (pet === queue[i] ? 1 : -1)), 0);
}
export const ROUND_MS = 30000;
