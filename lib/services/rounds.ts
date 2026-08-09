
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultType } from "@/types/event";

const ROUNDS = "event_game_rounds";
const ROUND_PLAYERS = "event_round_players";

export type RoundResultInput = {
  userId: string;
  score: number | null;
  rank: number | null;
};

export async function saveRoundResults(
  supabase: SupabaseClient,
  roundId: string,
  resultType: ResultType,
  values: RoundResultInput[],
) {
  if (values.length === 0) throw new Error("저장할 참가자가 없습니다.");

  if (resultType === "SCORE" && values.some((value) => value.score === null)) {
    throw new Error("모든 참가자의 점수를 입력해 주세요.");
  }

  const ranks = values.map((value) => value.rank).filter((rank): rank is number => rank !== null);
  if (resultType === "SIMPLE_SCORE" && (ranks.length !== values.length || new Set(ranks).size !== ranks.length)) {
    throw new Error("모든 참가자에게 서로 다른 등수를 선택해 주세요.");
  }

  const { error } = await supabase.from(ROUND_PLAYERS).upsert(
    values.map((value) => ({
      round_id: roundId,
      user_id: value.userId,
      score: resultType === "SCORE" ? value.score : null,
      rank: resultType === "SIMPLE_SCORE" ? value.rank : null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "round_id,user_id" },
  );
  if (error) throw error;
}

export async function clearRoundResults(supabase: SupabaseClient, roundId: string) {
  const { error } = await supabase
    .from(ROUND_PLAYERS)
    .update({ score: null, rank: null, updated_at: new Date().toISOString() })
    .eq("round_id", roundId);
  if (error) throw error;
}

export async function deleteRound(supabase: SupabaseClient, roundId: string) {
  const { error } = await supabase.from(ROUNDS).delete().eq("id", roundId);
  if (error) throw error;
}

export async function createRound(
  supabase: SupabaseClient,
  sessionId: string,
  userIds: string[],
  groupId?: string | null,
) {
  if (userIds.length === 0) throw new Error("참가자를 한 명 이상 선택해 주세요.");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("판을 만들려면 다시 로그인해 주세요.");

  const { data: existing, error: countError } = await supabase
    .from(ROUNDS)
    .select("round_number")
    .eq("session_id", sessionId)
    .order("round_number", { ascending: false })
    .limit(1);
  if (countError) throw countError;

  const nextNumber = (existing?.[0]?.round_number ?? 0) + 1;
  const { data: round, error: roundError } = await supabase
    .from(ROUNDS)
    .insert({ session_id: sessionId, group_id: groupId ?? null, round_number: nextNumber, created_by: user.id })
    .select("id")
    .single();
  if (roundError) throw roundError;

  const { error: playersError } = await supabase.from(ROUND_PLAYERS).insert(
    userIds.map((userId) => ({ round_id: round.id, user_id: userId })),
  );
  if (playersError) {
    await supabase.from(ROUNDS).delete().eq("id", round.id);
    throw playersError;
  }
}


