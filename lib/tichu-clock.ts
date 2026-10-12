export type TichuClock = { serverMs: number; receivedAt: number };

export function sampleTichuClock(serverTime: string | undefined, receivedAt: number): TichuClock | null {
  const serverMs = Date.parse(serverTime ?? "");
  return Number.isFinite(serverMs) ? { serverMs, receivedAt } : null;
}

// Only elapsed monotonic time is taken from the device, never its wall clock.
export function tichuSecondsLeft(deadline: string | null, clock: TichuClock | null, now: number): number | null {
  const end = Date.parse(deadline ?? "");
  if (!clock || !Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - clock.serverMs - Math.max(0, now - clock.receivedAt)) / 1000));
}
