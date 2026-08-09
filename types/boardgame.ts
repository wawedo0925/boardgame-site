export type Boardgame = {
  id: string;

  name: string;

  genre: string | null;

  difficulty: number | null;

  weight: number | null;

  best_players: string | null;

  icon: string | null;

  min_players: number | null;

  max_players: number | null;

  min_age: number | null;

  year_published: number | null;

  bgg_url: string | null;
};