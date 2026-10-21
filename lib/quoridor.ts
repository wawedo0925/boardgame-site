export type Wall = { r: number; c: number; o: "h" | "v"; seat?: number };
export function openEdge(a: number, b: number, walls: Wall[]) {
  if (a < 0 || a > 80 || b < 0 || b > 80) return false;
  const [ar, ac, br, bc] = [Math.floor(a / 9), a % 9, Math.floor(b / 9), b % 9];
  if (Math.abs(ar - br) + Math.abs(ac - bc) !== 1) return false;
  return !walls.some(w => w.o === "h"
    ? ar !== br && Math.min(ar, br) === w.r && ac >= w.c && ac <= w.c + 1
    : ac !== bc && Math.min(ac, bc) === w.c && ar >= w.r && ar <= w.r + 1);
}
export function legalMoves(pos: number, opponent: number, walls: Wall[]) {
  const result: number[] = [];
  for (const n of [pos - 9, pos + 9, pos - 1, pos + 1]) {
    if (!openEdge(pos, n, walls)) continue;
    if (n !== opponent) { result.push(n); continue; }
    const jump = n + n - pos;
    if (openEdge(n, jump, walls)) result.push(jump);
    else for (const side of Math.abs(n - pos) === 9 ? [n - 1, n + 1] : [n - 9, n + 9]) {
      if (openEdge(n, side, walls)) result.push(side);
    }
  }
  return result;
}
export function hasPath(start: number, goal: number, walls: Wall[]) {
  const queue = [start], seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if (Math.floor(n / 9) === goal) return true;
    for (const next of [n - 9, n + 9, n - 1, n + 1]) {
      if (!seen.has(next) && openEdge(n, next, walls)) { seen.add(next); queue.push(next); }
    }
  }
  return false;
}
export function validWall(walls: Wall[], positions: number[], wall: Wall) {
  const { r, c, o } = wall;
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 7 || c < 0 || c > 7) return false;
  if (walls.some(w => (w.r === r && w.c === c) || (w.o === o && (o === "h"
    ? w.r === r && Math.abs(w.c - c) < 2 : w.c === c && Math.abs(w.r - r) < 2)))) return false;
  return hasPath(positions[0], 0, [...walls, wall]) && hasPath(positions[1], 8, [...walls, wall]);
}
