import type { LiveRequest } from './live';

// Delivery completes the host's turn. Reading is tracked separately on the request.
export function canAdvanceNight(request?: LiveRequest) {
  return !request || request.status === 'CANCELLED' || request.status === 'RESOLVED';
}

export function playerRequestQueue(requests: LiveRequest[], night: number, confirmed: string[]) {
  // Snapshots are newest first. Keep the oldest unread result ahead of new work.
  const current = requests.filter(q => q.night === night);
  return [
    ...current.filter(q => q.status === 'RESOLVED' && !q.acknowledged && !confirmed.includes(q.id)).reverse(),
    ...current.filter(q => q.status === 'OPEN').reverse(),
  ];
}
