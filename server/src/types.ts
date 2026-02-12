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

export type PlannerPriority = "low" | "med" | "high";

export interface PlannerTask {
  id: string;
  title: string;
  priority: PlannerPriority;
  note: string | null;
  completed: boolean;
  startMin: number | null;
  endMin: number | null;
  sourceRecurringId?: string;
  deleted?: boolean;
}

export interface PlannerDay {
  tasks: PlannerTask[];
  generatedFromRecurring: boolean;
}

export interface RecurrenceRule {
  type: "daily" | "weekly";
  interval: number;
  weekdays?: number[];
}

export interface RecurringTask {
  id: string;
  title: string;
  priority: PlannerPriority;
  note: string | null;
  recurrence: RecurrenceRule;
  defaultSchedule: {
    startMin: number;
    endMin: number;
  } | null;
  createdAt: string;
  archived: boolean;
}

export interface TimeBlockingTemplateBlock {
  title: string;
  startMin: number;
  endMin: number;
  priority: PlannerPriority;
}

export interface TimeBlockingTemplate {
  id: string;
  name: string;
  blocks: TimeBlockingTemplateBlock[];
  createdAt: string;
}

export interface ExportPayload {
  settings: Settings;
  goals: Goal[];
  projects: Project[];
  topics: Topic[];
  sessions: SessionRecord[];
  planner?: Record<string, PlannerDay>;
  recurring?: RecurringTask[];
  templates?: TimeBlockingTemplate[];
}
