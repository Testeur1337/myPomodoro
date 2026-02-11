import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { ExportPayload, Goal, Project, SessionRecord, Settings, Topic } from "./types";

const dataDir = path.resolve(__dirname, "../data");
const settingsPath = path.join(dataDir, "settings.json");
const goalsPath = path.join(dataDir, "goals.json");
const projectsPath = path.join(dataDir, "projects.json");
const topicsPath = path.join(dataDir, "topics.json");
const sessionsPath = path.join(dataDir, "sessions.json");

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
  projectId: z.string().nullable(),
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

const exportSchema = z.object({
  settings: settingsSchema,
  goals: z.array(goalSchema).optional().default([]),
  projects: z.array(projectSchema).optional().default([]),
  topics: z.array(topicSchema),
  sessions: z.array(sessionSchema)
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

export async function initializeData() {
  await ensureDataDir();
  const settings = await readJsonFile<Settings>(settingsPath, defaultSettings);
  const goalsExists = await fs.access(goalsPath).then(() => true).catch(() => false);
  const projectsExists = await fs.access(projectsPath).then(() => true).catch(() => false);
  const goals = await readJsonFile<Goal[]>(goalsPath, goalsExists ? [] : [seedGoal]);
  const projects = await readJsonFile<Project[]>(projectsPath, projectsExists ? [] : [seedProject]);
  const rawTopics = await readJsonFile<any[]>(topicsPath, seedTopics);
  const rawSessions = await readJsonFile<any[]>(sessionsPath, []);

  const topics = rawTopics.map((topic) => topicSchema.parse({ ...topic, projectId: topic.projectId ?? null, archived: topic.archived ?? false }));

  const sessionMapped = rawSessions.map((session) => {
    const topic = topics.find((t) => t.id === (session.topicId ?? null));
    const project = projects.find((p) => p.id === (session.projectId ?? topic?.projectId ?? null));
    const goal = goals.find((g) => g.id === (session.goalId ?? project?.goalId ?? null));
    return sessionSchema.parse({
      ...session,
      goalId: goal?.id ?? null,
      projectId: project?.id ?? null,
      rating: session.rating ?? null
    });
  });

  await queueWrite(async () => {
    await writeJsonAtomic(settingsPath, settingsSchema.parse(settings));
    await writeJsonAtomic(goalsPath, z.array(goalSchema).parse(goals));
    await writeJsonAtomic(projectsPath, z.array(projectSchema).parse(projects));
    await writeJsonAtomic(topicsPath, z.array(topicSchema).parse(topics.length ? topics : seedTopics));
    await writeJsonAtomic(sessionsPath, z.array(sessionSchema).parse(sessionMapped));
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

export async function replaceAll(data: ExportPayload) {
  const parsed = exportSchema.parse(data);
  await queueWrite(async () => {
    await writeJsonAtomic(settingsPath, parsed.settings);
    await writeJsonAtomic(goalsPath, parsed.goals ?? []);
    await writeJsonAtomic(projectsPath, parsed.projects ?? []);
    await writeJsonAtomic(topicsPath, parsed.topics);
    await writeJsonAtomic(sessionsPath, parsed.sessions);
  });
  return {
    settings: parsed.settings,
    goals: parsed.goals ?? [],
    projects: parsed.projects ?? [],
    topics: parsed.topics,
    sessions: parsed.sessions
  };
}

export async function exportAll(): Promise<ExportPayload> {
  const [settings, goals, projects, topics, sessions] = await Promise.all([
    getSettings(), getGoals(), getProjects(), getTopics(), getSessions()
  ]);
  return { settings, goals, projects, topics, sessions };
}
