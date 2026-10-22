export type Wall = { r: number; c: number; o: "h" | "v"; seat?: number };
export function openEdge(a: number, b: number, walls: Wall[]) {
  if (a < 0 || a > 80 || b < 0 || b > 80) return false;
  const [ar, ac, br, bc] = [Math.floor(a / 9), a % 9, Math.floor(b / 9), b % 9];
  if (Math.abs(ar - br) + Math.abs(ac - bc) !== 1) return false;
  return !walls.some(w => w.o === "h"
    ? ar !== br && Math.min(ar, br) === w.r && ac >= w.c && ac <= w.c + 1
    : ac !== bc && Math.min(ac, bc) === w.c && ar >= w.r && ar <= w.r + 1);
}
export function legalMoves(pos: number, opponent: number | number[], walls: Wall[]) {
  const occupied = Array.isArray(opponent) ? opponent : [opponent];
  const result: number[] = [];
  for (const n of [pos - 9, pos + 9, pos - 1, pos + 1]) {
    if (!openEdge(pos, n, walls)) continue;
    if (!occupied.includes(n)) { result.push(n); continue; }
    const jump = n + n - pos;
    if (openEdge(n, jump, walls) && !occupied.includes(jump)) result.push(jump);
    else for (const side of Math.abs(n - pos) === 9 ? [n - 1, n + 1] : [n - 9, n + 9]) {
      if (openEdge(n, side, walls) && !occupied.includes(side)) result.push(side);
    }
  }
  return [...new Set(result)];
}
export function hasPath(start: number, goal: number, walls: Wall[], axis: "row" | "column" = "row") {
  const queue = [start], seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if ((axis === "row" ? Math.floor(n / 9) : n % 9) === goal) return true;
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
  return positions.every((pos, seat) => hasPath(pos, seat === 0 || seat === 3 ? 0 : 8, [...walls, wall], seat < 2 ? "row" : "column"));
}

export const reachedGoal = (pos: number, seat: number) => (seat < 2 ? Math.floor(pos / 9) : pos % 9) === (seat === 0 || seat === 3 ? 0 : 8);
export const nextSeat = (seat: number, count: number) => count === 4 ? [2,3,1,0][seat] : 1-seat;
