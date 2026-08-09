
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventGame, EventGameRound, RoundPlayer } from "@/types/event";

type RawPlayer = Omit<RoundPlayer, "profile">;

export type GameOption = { id: string; name: string; publisher: string | null; type: "SCORE" | "SIMPLE_SCORE" | "ROLE" | null };

export async function searchGames(supabase: SupabaseClient, query: string): Promise<GameOption[]> {
  let request = supabase.from("games").select("id, name, publisher, type").order("name").limit(30);
  if (query.trim()) request = request.or(`name.ilike.%${query.trim()}%,publisher.ilike.%${query.trim()}%`);
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as GameOption[];
}

export async function addEventGame(supabase: SupabaseClient, eventId: string, gameId: string, userId: string, resultType: GameOption["type"]) {
  const normalized = resultType === "SIMPLE_SCORE" || resultType === "ROLE" ? resultType : "SCORE";
  const { error } = await supabase.from("event_game_sessions").insert({ event_id: eventId, game_id: gameId, created_by: userId, result_type: normalized });
  if (error) throw error;
}

export async function deleteEventGame(supabase: SupabaseClient, sessionId: string) {
  const { error } = await supabase.from("event_game_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}

export async function getEventGames(supabase: SupabaseClient, eventId: string): Promise<EventGame[]> {
  const { data: games, error } = await supabase
    .from("event_game_sessions")
    .select("id, event_id, game_id, result_type, created_at, game:games(id, name, publisher, thumbnail)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!games?.length) return [];

  const sessionIds = games.map((game) => game.id);
  const { data: rounds, error: roundsError } = await supabase
    .from("event_game_rounds")
    .select("id, session_id, group_id, round_number, created_at")
    .in("session_id", sessionIds)
    .order("round_number", { ascending: true });
  if (roundsError) throw roundsError;

  const roundIds = (rounds ?? []).map((round) => round.id);
  let players: RawPlayer[] = [];
  if (roundIds.length) {
    const { data, error: playersError } = await supabase
      .from("event_round_players")
      .select("id, round_id, user_id, score, rank, role_name, team_name, is_winner")
      .in("round_id", roundIds);
    if (playersError) throw playersError;
    players = (data ?? []) as RawPlayer[];
  }

  const userIds = [...new Set(players.map((player) => player.user_id))];
  const profileMap = new Map<string, RoundPlayer["profile"]>();
  if (userIds.length) {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id, activity_name, birth_year, region, gender")
      .in("id", userIds);
    if (profileError) throw profileError;
    (data ?? []).forEach((profile) => profileMap.set(profile.id, profile));
  }

  const roundViews = (rounds ?? []).map((round) => ({
    ...round,
    players: players
      .filter((player) => player.round_id === round.id)
      .map((player) => ({ ...player, profile: profileMap.get(player.user_id) ?? null })),
  })) as EventGameRound[];

  return games.map((game) => ({
    ...game,
    result_type: game.result_type ?? "SCORE",
    game: Array.isArray(game.game) ? game.game[0] ?? null : game.game,
    rounds: roundViews.filter((round) => round.session_id === game.id),
  })) as EventGame[];
}


