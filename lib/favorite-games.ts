type Review = { game_id: string; rating: number; created_at: string };
// A later review replaces an earlier opinion; each game appears once.
export function favoriteGames<T extends Review>(reviews: T[]): T[] {
  const latest = new Map<string, T>();
  for (const review of reviews) {
    const previous = latest.get(review.game_id);
    if (!previous || review.created_at > previous.created_at) latest.set(review.game_id, review);
  }
  return [...latest.values()].filter(review => review.rating >= 4)
    .sort((a, b) => b.rating - a.rating || b.created_at.localeCompare(a.created_at));
}
