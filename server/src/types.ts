export type SessionType = "focus" | "break";

export interface Settings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  trackBreaks: boolean;
  dailyGoalMinutes: number;
  streakGoalMinutes: number;
  useLocalStorageFallback: boolean;
}

export interface Topic {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  type: SessionType;
  topicId?: string | null;
  topicName?: string | null;
  note?: string | null;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  createdAt: string;
}

export interface ExportPayload {
  settings: Settings;
  topics: Topic[];
  sessions: SessionRecord[];
}
