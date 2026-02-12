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

export interface Goal {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  archived: boolean;
}

export interface Project {
  id: string;
  goalId: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
  archived: boolean;
}

export interface Topic {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: string;
  archived: boolean;
}

export interface SessionRecord {
  id: string;
  type: SessionType;
  goalId: string | null;
  projectId: string | null;
  topicId?: string | null;
  topicName?: string | null;
  note?: string | null;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  createdAt: string;
}

export interface ExportPayload {
  settings: Settings;
  goals: Goal[];
  projects: Project[];
  topics: Topic[];
  sessions: SessionRecord[];
}

export type TimerPhase = "focus" | "shortBreak" | "longBreak";

export interface TimerState {
  phase: TimerPhase;
  remainingSeconds: number;
  isRunning: boolean;
  phaseEndsAtMs: number | null;
  currentGoalId: string | null;
  currentProjectId: string | null;
  currentTopicId: string | null;
  completedFocusSessions: number;
  lastCompletedPhaseKey: string | null;
}
