
export type ResultType = "SCORE" | "SIMPLE_SCORE" | "ROLE";
export type AttendanceStatus = "REGISTERED" | "PRESENT" | "ABSENT";

export type EventParticipant = {
  id: string;
  user_id: string;
  attendance_status?: AttendanceStatus;
  attendance_checked_at?: string | null;
  participation_role?: "PLAYER" | "GM";
  repeat_override?: boolean;
  profile: {
    id: string;
    activity_name: string | null;
    birth_year?: string | null;
    region?: string | null;
    gender?: string | null;
  } | null;
};

export type RoundPlayer = {
  id: string;
  round_id: string;
  user_id: string;
  score: number | null;
  rank: number | null;
  role_name: string | null;
  team_name: string | null;
  is_winner: boolean | null;
  profile: EventParticipant["profile"];
};

export type EventGameRound = {
  id: string;
  session_id: string;
  group_id: string | null;
  round_number: number;
  created_at: string;
  players: RoundPlayer[];
};

export type EventGame = {
  id: string;
  event_id: string;
  game_id: string;
  result_type: ResultType;
  created_at: string;
  game: {
    id: string;
    name: string;
    publisher: string | null;
    thumbnail?: string | null;
  } | null;
  rounds: EventGameRound[];
};
