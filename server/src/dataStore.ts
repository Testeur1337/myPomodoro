import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { ExportPayload, SessionRecord, Settings, Topic } from "./types";

const dataDir = path.resolve(__dirname, "../data");
const settingsPath = path.join(dataDir, "settings.json");
const topicsPath = path.join(dataDir, "topics.json");
const sessionsPath = path.join(dataDir, "sessions.json");

const settingsSchema = z.object({
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

const topicSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  color: z.string().min(1),
  createdAt: z.string()
});

const sessionSchema = z.object({
  id: z.string(),
  type: z.union([z.literal("focus"), z.literal("break")]),
  topicId: z.string().nullable().optional(),
  topicName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  startTime: z.string(),
  endTime: z.string(),
  durationSeconds: z.number().min(1),
  createdAt: z.string()
});

const exportSchema = z.object({
  settings: settingsSchema,
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

const seedTopics: Topic[] = [
  {
    id: "topic-ad-security",
    name: "AD Security",
    color: "#f97316",
    createdAt: new Date().toISOString()
  },
  {
    id: "topic-cv-linkedin",
    name: "CV/LinkedIn",
    color: "#22c55e",
    createdAt: new Date().toISOString()
  },
  {
    id: "topic-interviews",
    name: "Interviews",
    color: "#3b82f6",
    createdAt: new Date().toISOString()
  }
];

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    return fallback;
  }
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
  const topics = await readJsonFile<Topic[]>(topicsPath, seedTopics);
  const sessions = await readJsonFile<SessionRecord[]>(sessionsPath, []);

  await queueWrite(async () => {
    await writeJsonAtomic(settingsPath, settings);
    await writeJsonAtomic(topicsPath, topics.length ? topics : seedTopics);
    await writeJsonAtomic(sessionsPath, sessions);
  });
}

export async function getSettings() {
  const settings = await readJsonFile<Settings>(settingsPath, defaultSettings);
  return settingsSchema.parse(settings);
}

export async function saveSettings(settings: Settings) {
  const parsed = settingsSchema.parse(settings);
  await queueWrite(() => writeJsonAtomic(settingsPath, parsed));
  return parsed;
}

export async function getTopics() {
  const topics = await readJsonFile<Topic[]>(topicsPath, seedTopics);
  return z.array(topicSchema).parse(topics);
}

export async function saveTopics(topics: Topic[]) {
  const parsed = z.array(topicSchema).parse(topics);
  await queueWrite(() => writeJsonAtomic(topicsPath, parsed));
  return parsed;
}

export async function getSessions() {
  const sessions = await readJsonFile<SessionRecord[]>(sessionsPath, []);
  return z.array(sessionSchema).parse(sessions);
}

export async function saveSessions(sessions: SessionRecord[]) {
  const parsed = z.array(sessionSchema).parse(sessions);
  await queueWrite(() => writeJsonAtomic(sessionsPath, parsed));
  return parsed;
}

export async function replaceAll(data: ExportPayload) {
  const parsed = exportSchema.parse(data);
  await queueWrite(async () => {
    await writeJsonAtomic(settingsPath, parsed.settings);
    await writeJsonAtomic(topicsPath, parsed.topics);
    await writeJsonAtomic(sessionsPath, parsed.sessions);
  });
  return parsed;
}

export async function exportAll(): Promise<ExportPayload> {
  const settings = await getSettings();
  const topics = await getTopics();
  const sessions = await getSessions();
  return { settings, topics, sessions };
}
