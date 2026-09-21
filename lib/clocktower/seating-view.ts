import type { SeatLayout } from './live';

// Rotate coordinates only: labels stay upright and saved seats remain unchanged.
export function seatingView(layout: SeatLayout, degrees: number) {
  const entries = Object.entries(layout).map(([id, p]) => [id, { x: p.x * 0.6, y: p.y * 1.5 }] as const);
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
  return { positions, width: Math.max(600, ...Object.values(positions).map(p => p.x + 80)), height: Math.max(240, ...Object.values(positions).map(p => p.y + 80)) };
}
