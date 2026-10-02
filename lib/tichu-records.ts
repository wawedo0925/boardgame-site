export type TichuRecord = {
  room_id: string; round_no: number; game_mode: "TEAM" | "INDIVIDUAL";
  score: number; declaration: "SMALL" | "GRAND" | null;
  declaration_success: boolean | null; first_place: boolean; played_at: string;
};

export function summarizeTichu(records: TichuRecord[]) {
  const calls = (type: "SMALL" | "GRAND") => {
    const declared = records.filter(record => record.declaration === type);
    const success = declared.filter(record => record.declaration_success === true).length;
    return { attempts: declared.length, success, rate: declared.length ? success / declared.length * 100 : null };
  };
  return {
    rounds: records.length,
    score: records.reduce((sum, record) => sum + record.score, 0),
    small: calls("SMALL"), grand: calls("GRAND"),
  };
}
