import type { ResultType, RoundPlayer } from '@/types/event';
import { WOLF_BUCKETS } from './wolfstreet';

// Sort saved results without changing the roster used by the result editor.
export function orderRoundResults(players: RoundPlayer[], resultType: ResultType): RoundPlayer[] {
  const wolf = players.some(p => WOLF_BUCKETS.includes(p.role_name as typeof WOLF_BUCKETS[number]));
  return [...players].sort((a, b) => {
    const gm = Number(!!a.is_gm) - Number(!!b.is_gm);
    if (gm) return gm;
    const winner = Number(b.is_winner === true) - Number(a.is_winner === true);
    if (winner) return winner;
    if (wolf || resultType === 'SIMPLE_SCORE') {
      if (a.rank === null) return b.rank === null ? 0 : 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    }
    if (resultType === 'SCORE') {
      if (a.score === null) return b.score === null ? 0 : 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    }
    return 0;
  });
}
