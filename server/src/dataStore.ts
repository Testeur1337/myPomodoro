import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { ExportPayload, Goal, PlannerDay, PlannerTask, Project, RecurringTask, SessionRecord, Settings, TimeBlockingTemplate, Topic } from "./types";

const dataDir = path.resolve(__dirname, "../data");
const settingsPath = path.join(dataDir, "settings.json");
const goalsPath = path.join(dataDir, "goals.json");
const projectsPath = path.join(dataDir, "projects.json");
const topicsPath = path.join(dataDir, "topics.json");
const sessionsPath = path.join(dataDir, "sessions.json");
const plannerPath = path.join(dataDir, "planner.json");
const recurringPath = path.join(dataDir, "recurring.json");
const templatesPath = path.join(dataDir, "templates.json");

const UNASSIGNED_GOAL_ID = "g-unassigned";
const UNASSIGNED_PROJECT_ID = "p-unassigned";
const UNASSIGNED_TOPIC_ID = "t-unassigned";

export const settingsSchema = z.object({
  focusMinutes: z.number().min(1),
  shortBreakMinutes: z.number().min(1),
  longBreakMinutes: z.number().min(1),
  longBreakInterval: z.number().min(1),
  autoStartBreaks: z.boolean(),
  autoStartFocus: z.boolean(),
  trackBreaks: z.boolean(),
  dailyGoalMinutes: z.number().min(1),
  streakGoalMinutes: z.number().min(1),
  useLocalStorageFallback: z.boolean()
});

export const goalSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  createdAt: z.string(),
  archived: z.boolean()
});

export const projectSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  color: z.string().optional().default(""),
  createdAt: z.string(),
  archived: z.boolean()
});

export const topicSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1),
  color: z.string().min(1),
  createdAt: z.string(),
  archived: z.boolean().default(false)
});

export const sessionSchema = z.object({
  id: z.string(),
  type: z.union([z.literal("focus"), z.literal("break")]),
  goalId: z.string().nullable(),
  projectId: z.string().nullable(),
  topicId: z.string().nullable().optional(),
  topicName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable().optional(),
  startTime: z.string(),
  endTime: z.string(),
  durationSeconds: z.number().min(1),
  createdAt: z.string()
});



const prioritySchema = z.union([z.literal("low"), z.literal("med"), z.literal("high")]);

const plannerTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  priority: prioritySchema,
  note: z.string().nullable().optional(),
  completed: z.boolean().default(false),
  startMin: z.number().int().min(0).max(1439).nullable().optional(),
  endMin: z.number().int().min(1).max(1440).nullable().optional(),
  sourceRecurringId: z.string().optional(),
  deleted: z.boolean().optional().default(false)
}).transform((task) => ({ ...task, note: task.note ?? null, startMin: task.startMin ?? null, endMin: task.endMin ?? null }));

const plannerDaySchema = z.object({
  tasks: z.array(plannerTaskSchema).default([]),
  generatedFromRecurring: z.boolean().default(false)
});

const plannerSchema = z.record(z.string(), plannerDaySchema);

const recurrenceRuleSchema = z.object({
  type: z.union([z.literal("daily"), z.literal("weekly")]),
  interval: z.number().int().min(1).max(30),
  weekdays: z.array(z.number().int().min(1).max(7)).optional()
});

const recurringTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  priority: prioritySchema,
  note: z.string().nullable().optional(),
  recurrence: recurrenceRuleSchema,
  defaultSchedule: z.object({
    startMin: z.number().int().min(0).max(1439),
    endMin: z.number().int().min(1).max(1440)
  }).nullable().optional(),
  createdAt: z.string(),
  archived: z.boolean().default(false)
}).superRefine((item, ctx) => {
  if (item.defaultSchedule && item.defaultSchedule.endMin <= item.defaultSchedule.startMin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "defaultSchedule endMin must be greater than startMin" });
  }
  if (item.recurrence.type === "weekly" && (!item.recurrence.weekdays || !item.recurrence.weekdays.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "weekly recurrence requires weekdays" });
  }
}).transform((item) => ({ ...item, note: item.note ?? null, defaultSchedule: item.defaultSchedule ?? null }));

const templateBlockSchema = z.object({
  title: z.string().min(1),
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(1).max(1440),
  priority: prioritySchema
}).superRefine((b, ctx) => {
  if (b.endMin <= b.startMin) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "block endMin must be greater than startMin" });
});

const templateSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  blocks: z.array(templateBlockSchema).default([]),
  createdAt: z.string()
});

const exportSchema = z.object({
  settings: settingsSchema,
  goals: z.array(goalSchema).optional().default([]),
  projects: z.array(projectSchema).optional().default([]),
  topics: z.array(topicSchema).optional().default([]),
  sessions: z.array(sessionSchema).optional().default([]),
  planner: plannerSchema.optional().default({}),
  recurring: z.array(recurringTaskSchema).optional().default([]),
  templates: z.array(templateSchema).optional().default([])
});

let writeQueue: Promise<void> = Promise.resolve();

const defaultSettings: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  trackBreaks: true,
  dailyGoalMinutes: 120,
  streakGoalMinutes: 60,
  useLocalStorageFallback: false
};

const seedGoal: Goal = {
  id: "g-career",
  name: "Career",
  description: "",
  createdAt: new Date().toISOString(),
  archived: false
};

const seedProject: Project = {
  id: "p-ai-job-seekers",
  goalId: seedGoal.id,
  name: "AI for Job Seekers",
  description: "",
  color: "#38bdf8",
  createdAt: new Date().toISOString(),
  archived: false
};

const seedTopics: Topic[] = [
  { id: "topic-cv", projectId: seedProject.id, name: "CV", color: "#f97316", createdAt: new Date().toISOString(), archived: false },
  { id: "topic-linkedin", projectId: seedProject.id, name: "LinkedIn", color: "#22c55e", createdAt: new Date().toISOString(), archived: false },
  { id: "topic-interviews", projectId: seedProject.id, name: "Interviews", color: "#3b82f6", createdAt: new Date().toISOString(), archived: false }
];

async function ensureDataDir() { await fs.mkdir(dataDir, { recursive: true }); }

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(filePath, "utf-8")) as T; } catch { return fallback; }
}

async function writeJsonAtomic(filePath: string, data: unknown) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
}

function queueWrite(action: () => Promise<void>) {
  writeQueue = writeQueue.then(action).catch(() => action());
  return writeQueue;
}

function normalizeGoals(raw: any[]): Goal[] {
  return raw.map((goal) => goalSchema.parse({ ...goal, description: goal.description ?? "", archived: goal.archived ?? false }));
}

function normalizeProjects(raw: any[]): Project[] {
  return raw.map((project) => projectSchema.parse({ ...project, goalId: project.goalId ?? "", description: project.description ?? "", color: project.color ?? "", archived: project.archived ?? false }));
}

function normalizeTopics(raw: any[]): Topic[] {
  return raw.map((topic) => topicSchema.parse({ ...topic, projectId: topic.projectId ?? "", archived: topic.archived ?? false }));
}

function normalizeSessions(raw: any[]): SessionRecord[] {
  return raw.map((session) => sessionSchema.parse({ ...session, goalId: session.goalId ?? null, projectId: session.projectId ?? null, topicId: session.topicId ?? null, topicName: session.topicName ?? null, note: session.note ?? null, rating: session.rating ?? null }));
}

export function migrateHierarchyData(input: { goals: Goal[]; projects: Project[]; topics: Topic[]; sessions: SessionRecord[] }) {
  const goals = [...input.goals];
  const projects = [...input.projects];
  const topics = [...input.topics];
  const sessions = [...input.sessions];

  const now = new Date().toISOString();

  let unassignedGoal = goals.find((g) => g.id === UNASSIGNED_GOAL_ID) ?? goals.find((g) => g.name === "Unassigned");
  if (!unassignedGoal) {
    unassignedGoal = { id: UNASSIGNED_GOAL_ID, name: "Unassigned", description: "", createdAt: now, archived: false };
    goals.push(unassignedGoal);
  } else if (unassignedGoal.archived) {
    unassignedGoal.archived = false;
  }

  const goalIds = new Set(goals.map((goal) => goal.id));

  let unassignedProject = projects.find((p) => p.id === UNASSIGNED_PROJECT_ID) ?? projects.find((p) => p.name === "Unassigned" && p.goalId === unassignedGoal.id);
  if (!unassignedProject) {
    unassignedProject = { id: UNASSIGNED_PROJECT_ID, goalId: unassignedGoal.id, name: "Unassigned", description: "", color: "#64748b", createdAt: now, archived: false };
    projects.push(unassignedProject);
  } else {
    unassignedProject.goalId = goalIds.has(unassignedProject.goalId) ? unassignedProject.goalId : unassignedGoal.id;
    unassignedProject.archived = false;
  }

  for (const project of projects) {
    if (!goalIds.has(project.goalId)) {
      project.goalId = unassignedGoal.id;
    }
  }

  const projectIds = new Set(projects.map((project) => project.id));

  for (const topic of topics) {
    if (!projectIds.has(topic.projectId)) {
      topic.projectId = unassignedProject.id;
    }
  }

  let unassignedTopic = topics.find((topic) => topic.id === UNASSIGNED_TOPIC_ID) ?? topics.find((topic) => topic.name === "Unassigned Topic" && topic.projectId === unassignedProject.id);
  if (!unassignedTopic) {
    unassignedTopic = { id: UNASSIGNED_TOPIC_ID, projectId: unassignedProject.id, name: "Unassigned Topic", color: "#64748b", createdAt: now, archived: false };
    topics.push(unassignedTopic);
  } else {
    unassignedTopic.projectId = unassignedProject.id;
    unassignedTopic.archived = false;
  }

  const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
  const projectMap = new Map(projects.map((project) => [project.id, project]));

  for (const session of sessions) {
    if (session.type === "focus" && (!session.topicId || !topicMap.has(session.topicId))) {
      session.topicId = unassignedTopic.id;
    }

    if (session.topicId && !topicMap.has(session.topicId)) {
      session.topicId = unassignedTopic.id;
    }

    if (session.topicId) {
      const topic = topicMap.get(session.topicId) ?? unassignedTopic;
      const project = projectMap.get(topic.projectId) ?? unassignedProject;
      session.topicId = topic.id;
      session.topicName = topic.name;
      session.projectId = project.id;
      session.goalId = project.goalId;
      continue;
    }

    session.projectId = null;
    session.goalId = null;
    session.topicName = session.topicName ?? null;
  }

  return {
    goals: z.array(goalSchema).parse(goals),
    projects: z.array(projectSchema).parse(projects),
    topics: z.array(topicSchema).parse(topics),
    sessions: z.array(sessionSchema).parse(sessions)
  };
}

async function persistAll(settings: Settings, data: { goals: Goal[]; projects: Project[]; topics: Topic[]; sessions: SessionRecord[]; planner?: Record<string, PlannerDay>; recurring?: RecurringTask[]; templates?: TimeBlockingTemplate[] }) {
  const migrated = migrateHierarchyData(data);
  await queueWrite(async () => {
    await writeJsonAtomic(settingsPath, settingsSchema.parse(settings));
    await writeJsonAtomic(goalsPath, migrated.goals);
    await writeJsonAtomic(projectsPath, migrated.projects);
    await writeJsonAtomic(topicsPath, migrated.topics.length ? migrated.topics : seedTopics);
    await writeJsonAtomic(sessionsPath, migrated.sessions);
    await writeJsonAtomic(plannerPath, plannerSchema.parse(data.planner ?? {}));
    await writeJsonAtomic(recurringPath, z.array(recurringTaskSchema).parse(data.recurring ?? []));
    await writeJsonAtomic(templatesPath, z.array(templateSchema).parse(data.templates ?? []));
  });
  return migrated;
}

export async function initializeData() {
  await ensureDataDir();
  const settings = settingsSchema.parse(await readJsonFile<Settings>(settingsPath, defaultSettings));
  const goalsExists = await fs.access(goalsPath).then(() => true).catch(() => false);
  const projectsExists = await fs.access(projectsPath).then(() => true).catch(() => false);

  const rawGoals = await readJsonFile<any[]>(goalsPath, goalsExists ? [] : [seedGoal]);
  const rawProjects = await readJsonFile<any[]>(projectsPath, projectsExists ? [] : [seedProject]);
  const rawTopics = await readJsonFile<any[]>(topicsPath, seedTopics);
  const rawSessions = await readJsonFile<any[]>(sessionsPath, []);
  const rawPlanner = await readJsonFile<Record<string, any>>(plannerPath, {});
  const rawRecurring = await readJsonFile<any[]>(recurringPath, []);
  const rawTemplates = await readJsonFile<any[]>(templatesPath, []);

  await persistAll(settings, {
    goals: normalizeGoals(rawGoals),
    projects: normalizeProjects(rawProjects),
    topics: normalizeTopics(rawTopics),
    sessions: normalizeSessions(rawSessions),
    planner: plannerSchema.parse(rawPlanner),
    recurring: z.array(recurringTaskSchema).parse(rawRecurring),
    templates: z.array(templateSchema).parse(rawTemplates)
  });
}

export const getSettings = async () => settingsSchema.parse(await readJsonFile(settingsPath, defaultSettings));
export const saveSettings = async (settings: Settings) => {
  const parsed = settingsSchema.parse(settings);
  await queueWrite(() => writeJsonAtomic(settingsPath, parsed));
  return parsed;
};

export const getGoals = async () => z.array(goalSchema).parse(await readJsonFile(goalsPath, [] as Goal[]));
export const saveGoals = async (goals: Goal[]) => {
  const parsed = z.array(goalSchema).parse(goals);
  await queueWrite(() => writeJsonAtomic(goalsPath, parsed));
  return parsed;
};

export const getProjects = async () => z.array(projectSchema).parse(await readJsonFile(projectsPath, [] as Project[]));
export const saveProjects = async (projects: Project[]) => {
  const parsed = z.array(projectSchema).parse(projects);
  await queueWrite(() => writeJsonAtomic(projectsPath, parsed));
  return parsed;
};

export const getTopics = async () => z.array(topicSchema).parse(await readJsonFile(topicsPath, seedTopics));
export const saveTopics = async (topics: Topic[]) => {
  const parsed = z.array(topicSchema).parse(topics);
  await queueWrite(() => writeJsonAtomic(topicsPath, parsed));
  return parsed;
};

export const getSessions = async () => z.array(sessionSchema).parse(await readJsonFile(sessionsPath, [] as SessionRecord[]));
export const saveSessions = async (sessions: SessionRecord[]) => {
  const parsed = z.array(sessionSchema).parse(sessions);
  await queueWrite(() => writeJsonAtomic(sessionsPath, parsed));
  return parsed;
};


export const getPlanner = async () => plannerSchema.parse(await readJsonFile(plannerPath, {} as Record<string, PlannerDay>));
export const savePlanner = async (planner: Record<string, PlannerDay>) => {
  const parsed = plannerSchema.parse(planner);
  await queueWrite(() => writeJsonAtomic(plannerPath, parsed));
  return parsed;
};

export const getRecurring = async () => z.array(recurringTaskSchema).parse(await readJsonFile(recurringPath, [] as RecurringTask[]));
export const saveRecurring = async (items: RecurringTask[]) => {
  const parsed = z.array(recurringTaskSchema).parse(items);
  await queueWrite(() => writeJsonAtomic(recurringPath, parsed));
  return parsed;
};

export const getTemplates = async () => z.array(templateSchema).parse(await readJsonFile(templatesPath, [] as TimeBlockingTemplate[]));
export const saveTemplates = async (items: TimeBlockingTemplate[]) => {
  const parsed = z.array(templateSchema).parse(items);
  await queueWrite(() => writeJsonAtomic(templatesPath, parsed));
  return parsed;
};

function recurringMatchesDate(item: RecurringTask, date: string): boolean {
  const dayDate = new Date(`${date}T00:00:00.000Z`);
  const created = new Date(item.createdAt);
  if (Number.isNaN(dayDate.getTime()) || Number.isNaN(created.getTime())) return false;
  const diffDays = Math.floor((dayDate.getTime() - created.getTime()) / 86400000);
  if (diffDays < 0) return false;
  if (item.recurrence.type === "daily") return diffDays % item.recurrence.interval === 0;
  const weekday = ((dayDate.getUTCDay() + 6) % 7) + 1;
  if (!(item.recurrence.weekdays ?? []).includes(weekday)) return false;
  const diffWeeks = Math.floor(diffDays / 7);
  return diffWeeks % item.recurrence.interval === 0;
}

export async function getPlannerForDate(date: string): Promise<PlannerDay> {
  const [planner, recurring] = await Promise.all([getPlanner(), getRecurring()]);
  const day = planner[date] ?? { tasks: [], generatedFromRecurring: false };
  const activeRecurring = recurring.filter((item) => !item.archived && recurringMatchesDate(item, date));
  const existingRecurringIds = new Set(day.tasks.filter((t) => t.sourceRecurringId).map((t) => t.sourceRecurringId));
  const virtualTasks: PlannerTask[] = activeRecurring
    .filter((item) => !existingRecurringIds.has(item.id) && !day.tasks.some((t) => t.deleted && t.sourceRecurringId === item.id))
    .map((item) => ({
      id: `vrt_${item.id}_${date}`,
      title: item.title,
      priority: item.priority,
      note: item.note,
      completed: false,
      startMin: item.defaultSchedule?.startMin ?? null,
      endMin: item.defaultSchedule?.endMin ?? null,
      sourceRecurringId: item.id
    }));

  return { tasks: [...day.tasks.filter((t) => !t.deleted), ...virtualTasks], generatedFromRecurring: virtualTasks.length > 0 || day.generatedFromRecurring };
}

export async function savePlannerDay(date: string, day: PlannerDay): Promise<PlannerDay> {
  const planner = await getPlanner();
  const normalized = plannerDaySchema.parse(day);
  planner[date] = normalized;
  await savePlanner(planner);
  return normalized;
}

export async function replaceAll(data: ExportPayload) {
  const parsed = exportSchema.parse(data);
  const migrated = await persistAll(parsed.settings, {
    goals: parsed.goals ?? [],
    projects: parsed.projects ?? [],
    topics: parsed.topics ?? [],
    sessions: parsed.sessions ?? [],
    planner: parsed.planner ?? {},
    recurring: parsed.recurring ?? [],
    templates: parsed.templates ?? []
  });

  return {
    settings: parsed.settings,
    goals: migrated.goals,
    projects: migrated.projects,
    topics: migrated.topics,
    sessions: migrated.sessions,
    planner: parsed.planner ?? {},
    recurring: parsed.recurring ?? [],
    templates: parsed.templates ?? []
  };
}

export async function exportAll(): Promise<ExportPayload> {
  const [settings, goals, projects, topics, sessions, planner, recurring, templates] = await Promise.all([
    getSettings(), getGoals(), getProjects(), getTopics(), getSessions(), getPlanner(), getRecurring(), getTemplates()
  ]);
  const migrated = migrateHierarchyData({ goals, projects, topics, sessions });
  return { settings, ...migrated, planner, recurring, templates };
}
