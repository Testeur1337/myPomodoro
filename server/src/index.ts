import express from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  exportAll,
  getSessions,
  getSettings,
  getTopics,
  initializeData,
  replaceAll,
  saveSessions,
  saveSettings,
  saveTopics
} from "./dataStore";
import { SessionRecord, SessionType, Settings, Topic } from "./types";

const app = express();
const port = Number(process.env.PORT) || 5174;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

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

const topicPayloadSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1)
});

const sessionPayloadSchema = z.object({
  type: z.union([z.literal("focus"), z.literal("break")]),
  topicId: z.string().nullable().optional(),
  topicName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  startTime: z.string(),
  endTime: z.string(),
  durationSeconds: z.number().min(1)
});

const sessionUpdateSchema = z.object({
  topicId: z.string().nullable().optional(),
  topicName: z.string().nullable().optional(),
  note: z.string().nullable().optional()
});

app.get("/api/settings", async (_req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

app.put("/api/settings", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid settings payload" });
    return;
  }
  const saved = await saveSettings(parsed.data as Settings);
  res.json(saved);
});

app.get("/api/topics", async (_req, res) => {
  const topics = await getTopics();
  res.json(topics);
});

app.post("/api/topics", async (req, res) => {
  const parsed = topicPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid topic payload" });
    return;
  }
  const topics = await getTopics();
  const newTopic: Topic = {
    id: randomUUID(),
    name: parsed.data.name,
    color: parsed.data.color,
    createdAt: new Date().toISOString()
  };
  const updated = [...topics, newTopic];
  await saveTopics(updated);
  res.status(201).json(newTopic);
});

app.put("/api/topics/:id", async (req, res) => {
  const parsed = topicPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid topic payload" });
    return;
  }
  const topics = await getTopics();
  const updated = topics.map((topic) =>
    topic.id === req.params.id
      ? { ...topic, name: parsed.data.name, color: parsed.data.color }
      : topic
  );
  await saveTopics(updated);
  const found = updated.find((topic) => topic.id === req.params.id);
  if (!found) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  res.json(found);
});

app.delete("/api/topics/:id", async (req, res) => {
  const topics = await getTopics();
  const updated = topics.filter((topic) => topic.id !== req.params.id);
  await saveTopics(updated);
  res.status(204).send();
});

app.get("/api/sessions", async (req, res) => {
  const sessions = await getSessions();
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const topicId = req.query.topicId ? String(req.query.topicId) : null;
  const type = req.query.type ? (String(req.query.type) as SessionType) : null;

  const filtered = sessions.filter((session) => {
    const start = new Date(session.startTime).getTime();
    const withinFrom = from ? start >= from.getTime() : true;
    const withinTo = to ? start <= to.getTime() : true;
    const topicMatch = topicId ? session.topicId === topicId : true;
    const typeMatch = type ? session.type === type : true;
    return withinFrom && withinTo && topicMatch && typeMatch;
  });

  res.json(filtered);
});

app.post("/api/sessions", async (req, res) => {
  const parsed = sessionPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session payload" });
    return;
  }
  const sessions = await getSessions();
  const newSession: SessionRecord = {
    id: randomUUID(),
    type: parsed.data.type,
    topicId: parsed.data.topicId ?? null,
    topicName: parsed.data.topicName ?? null,
    note: parsed.data.note ?? null,
    startTime: parsed.data.startTime,
    endTime: parsed.data.endTime,
    durationSeconds: parsed.data.durationSeconds,
    createdAt: new Date().toISOString()
  };
  const updated = [...sessions, newSession];
  await saveSessions(updated);
  res.status(201).json(newSession);
});

app.put("/api/sessions/:id", async (req, res) => {
  const parsed = sessionUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session update payload" });
    return;
  }
  const sessions = await getSessions();
  const updated = sessions.map((session) =>
    session.id === req.params.id
      ? {
          ...session,
          topicId: parsed.data.topicId ?? session.topicId,
          topicName: parsed.data.topicName ?? session.topicName,
          note: parsed.data.note ?? session.note
        }
      : session
  );
  await saveSessions(updated);
  const found = updated.find((session) => session.id === req.params.id);
  if (!found) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(found);
});

app.delete("/api/sessions/:id", async (req, res) => {
  const sessions = await getSessions();
  const updated = sessions.filter((session) => session.id !== req.params.id);
  await saveSessions(updated);
  res.status(204).send();
});

app.post("/api/import", async (req, res) => {
  try {
    const replaced = await replaceAll(req.body);
    res.json(replaced);
  } catch (error) {
    res.status(400).json({ error: "Invalid import payload" });
  }
});

app.get("/api/export", async (_req, res) => {
  const data = await exportAll();
  res.json(data);
});

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

initializeData().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
});
