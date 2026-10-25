import type { SeatLayout } from './live';

export const SEATING_X_SCALE = 600 / (940 - 60);
export const SEATING_Y_SCALE = 1.65;
export const SEATING_EDIT_HEIGHT = (660 - 40) * SEATING_Y_SCALE;
export function seatingPoint(x: number, y: number) {
  return { x: x / SEATING_X_SCALE + 60, y: y / SEATING_Y_SCALE + 40 };
}

// Rotate coordinates only: labels stay upright and saved seats remain unchanged.
export function seatingView(layout: SeatLayout, degrees: number) {
  const entries = Object.entries(layout).map(([id, p]) => [id, { x: (p.x - 60) * SEATING_X_SCALE, y: (p.y - 40) * SEATING_Y_SCALE }] as const);
  if (!entries.length) return { positions: {} as SeatLayout, width: 600, height: 240 };
  const xs = entries.map(([, p]) => p.x), ys = entries.map(([, p]) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const angle = degrees * Math.PI / 180;
  const rotated = entries.map(([id, p]) => [id, {
    x: cx + (p.x - cx) * Math.cos(angle) - (p.y - cy) * Math.sin(angle),
    y: cy + (p.x - cx) * Math.sin(angle) + (p.y - cy) * Math.cos(angle),
  }] as const);
  const dx = degrees ? Math.min(...xs) - Math.min(...rotated.map(([, p]) => p.x)) : 0;
  const dy = degrees ? Math.min(...ys) - Math.min(...rotated.map(([, p]) => p.y)) : 0;
  const positions = Object.fromEntries(rotated.map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]));
  return { positions, width: degrees ? Math.max(600, ...Object.values(positions).map(p => p.x)) : 600, height: degrees ? Math.max(SEATING_EDIT_HEIGHT, ...Object.values(positions).map(p => p.y)) : SEATING_EDIT_HEIGHT };
}
