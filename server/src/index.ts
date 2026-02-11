import express from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  exportAll,
  getGoals,
  getProjects,
  getSessions,
  getSettings,
  getTopics,
  initializeData,
  replaceAll,
  saveGoals,
  saveProjects,
  saveSessions,
  saveSettings,
  saveTopics,
  settingsSchema
} from "./dataStore";
import { Goal, Project, SessionRecord, SessionType, Settings, Topic } from "./types";
import { deriveSessionHierarchy } from "./sessionHierarchy";

const app = express();
const port = Number(process.env.PORT) || 5174;
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

const goalPayloadSchema = z.object({ name: z.string().min(1), description: z.string().optional().default("") });
const projectPayloadSchema = z.object({ goalId: z.string(), name: z.string().min(1), description: z.string().optional().default(""), color: z.string().optional().default("") });
const topicPayloadSchema = z.object({ name: z.string().min(1), color: z.string().min(1), projectId: z.string() });
const sessionPayloadSchema = z.object({
  type: z.union([z.literal("focus"), z.literal("break")]),
  goalId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  topicName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable().optional(),
  startTime: z.string(),
  endTime: z.string(),
  durationSeconds: z.number().min(1)
});
const sessionUpdateSchema = z.object({
  topicId: z.string().nullable().optional(),
  topicName: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable().optional(),
  projectId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  type: z.union([z.literal("focus"), z.literal("break")]).optional()
});

app.get("/api/settings", async (_req, res) => res.json(await getSettings()));
app.put("/api/settings", async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid settings payload" });
  res.json(await saveSettings(parsed.data as Settings));
});

app.get("/api/goals", async (_req, res) => res.json(await getGoals()));
app.post("/api/goals", async (req, res) => {
  const parsed = goalPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid goal payload" });
  const goals = await getGoals();
  const newGoal: Goal = { id: `g_${randomUUID()}`, name: parsed.data.name, description: parsed.data.description, createdAt: new Date().toISOString(), archived: false };
  await saveGoals([...goals, newGoal]);
  res.status(201).json(newGoal);
});
app.put("/api/goals/:id", async (req, res) => {
  const parsed = goalPayloadSchema.extend({ archived: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid goal payload" });
  const [goals, projects] = await Promise.all([getGoals(), getProjects()]);
  const idx = goals.findIndex((g) => g.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Goal not found" });
  if (parsed.data.archived === true && projects.some((project) => project.goalId === req.params.id && !project.archived)) {
    return res.status(409).json({ error: "Cannot archive goal with active projects" });
  }
  goals[idx] = { ...goals[idx], ...parsed.data };
  await saveGoals(goals);
  res.json(goals[idx]);
});
app.delete("/api/goals/:id", async (req, res) => {
  const [goals, projects] = await Promise.all([getGoals(), getProjects()]);
  const idx = goals.findIndex((g) => g.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Goal not found" });
  if (projects.some((project) => project.goalId === req.params.id && !project.archived)) {
    return res.status(409).json({ error: "Cannot archive goal with active projects" });
  }
  goals[idx].archived = true;
  await saveGoals(goals);
  res.status(204).send();
});

app.get("/api/projects", async (req, res) => {
  const goalId = req.query.goalId ? String(req.query.goalId) : null;
  const projects = await getProjects();
  res.json(goalId ? projects.filter((p) => p.goalId === goalId) : projects);
});
app.post("/api/projects", async (req, res) => {
  const parsed = projectPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid project payload" });
  const goals = await getGoals();
  if (!goals.some((g) => g.id === parsed.data.goalId && !g.archived)) return res.status(400).json({ error: "goalId does not exist" });
  const projects = await getProjects();
  const project: Project = { id: `p_${randomUUID()}`, ...parsed.data, createdAt: new Date().toISOString(), archived: false };
  await saveProjects([...projects, project]);
  res.status(201).json(project);
});
app.put("/api/projects/:id", async (req, res) => {
  const parsed = projectPayloadSchema.extend({ archived: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid project payload" });
  const [projects, goals, topics] = await Promise.all([getProjects(), getGoals(), getTopics()]);
  if (!goals.some((goal) => goal.id === parsed.data.goalId && !goal.archived)) {
    return res.status(400).json({ error: "goalId does not exist" });
  }
  const idx = projects.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Project not found" });
  if (parsed.data.archived === true && topics.some((topic) => topic.projectId === req.params.id && !topic.archived)) {
    return res.status(409).json({ error: "Cannot archive project with active topics" });
  }
  projects[idx] = { ...projects[idx], ...parsed.data };
  await saveProjects(projects);
  res.json(projects[idx]);
});
app.delete("/api/projects/:id", async (req, res) => {
  const [projects, topics] = await Promise.all([getProjects(), getTopics()]);
  const idx = projects.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Project not found" });
  if (topics.some((topic) => topic.projectId === req.params.id && !topic.archived)) {
    return res.status(409).json({ error: "Cannot archive project with active topics" });
  }
  projects[idx].archived = true;
  await saveProjects(projects);
  res.status(204).send();
});

app.get("/api/topics", async (req, res) => {
  const projectId = req.query.projectId ? String(req.query.projectId) : null;
  const goalId = req.query.goalId ? String(req.query.goalId) : null;
  const topics = await getTopics();
  const projects = await getProjects();
  const scopedProjectIds = goalId ? projects.filter((p) => p.goalId === goalId).map((p) => p.id) : null;
  res.json(topics.filter((t) => (!projectId || t.projectId === projectId) && (!scopedProjectIds || scopedProjectIds.includes(t.projectId))));
});
app.post("/api/topics", async (req, res) => {
  const parsed = topicPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid topic payload" });
  const [topics, projects] = await Promise.all([getTopics(), getProjects()]);
  if (!projects.some((project) => project.id === parsed.data.projectId && !project.archived)) {
    return res.status(400).json({ error: "projectId does not exist" });
  }
  const topic: Topic = { id: `t_${randomUUID()}`, name: parsed.data.name, color: parsed.data.color, projectId: parsed.data.projectId, createdAt: new Date().toISOString(), archived: false };
  await saveTopics([...topics, topic]);
  res.status(201).json(topic);
});
app.put("/api/topics/:id", async (req, res) => {
  const parsed = topicPayloadSchema.extend({ archived: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid topic payload" });
  const [topics, projects, sessions] = await Promise.all([getTopics(), getProjects(), getSessions()]);
  if (!projects.some((project) => project.id === parsed.data.projectId && !project.archived)) {
    return res.status(400).json({ error: "projectId does not exist" });
  }
  const idx = topics.findIndex((t) => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Topic not found" });
  if (parsed.data.archived === true && sessions.some((session) => session.topicId === req.params.id)) {
    return res.status(409).json({ error: "Cannot archive topic with existing sessions" });
  }
  topics[idx] = { ...topics[idx], ...parsed.data };
  await saveTopics(topics);
  res.json(topics[idx]);
});
app.delete("/api/topics/:id", async (req, res) => {
  const [topics, sessions] = await Promise.all([getTopics(), getSessions()]);
  const idx = topics.findIndex((t) => t.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Topic not found" });
  if (sessions.some((session) => session.topicId === req.params.id)) {
    return res.status(409).json({ error: "Cannot archive topic with existing sessions" });
  }
  topics[idx].archived = true;
  await saveTopics(topics);
  res.status(204).send();
});

app.get("/api/sessions", async (req, res) => {
  const sessions = await getSessions();
  const from = req.query.from ? new Date(String(req.query.from)).getTime() : null;
  const to = req.query.to ? new Date(String(req.query.to)).getTime() : null;
  const topicId = req.query.topicId ? String(req.query.topicId) : null;
  const projectId = req.query.projectId ? String(req.query.projectId) : null;
  const goalId = req.query.goalId ? String(req.query.goalId) : null;
  const type = req.query.type ? (String(req.query.type) as SessionType) : null;

  res.json(sessions.filter((session) => {
    const start = new Date(session.startTime).getTime();
    if (from && start < from) return false;
    if (to && start > to) return false;
    if (type && session.type !== type) return false;
    if (topicId) return session.topicId === topicId;
    if (projectId) return session.projectId === projectId;
    if (goalId) return session.goalId === goalId;
    return true;
  }));
});
app.post("/api/sessions", async (req, res) => {
  const parsed = sessionPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid session payload" });
  const [sessions, topics, projects] = await Promise.all([getSessions(), getTopics(), getProjects()]);
  try {
    const derived = deriveSessionHierarchy(parsed.data, topics, projects);
    const newSession: SessionRecord = {
      id: `s_${randomUUID()}`,
      type: parsed.data.type,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      durationSeconds: parsed.data.durationSeconds,
      note: parsed.data.note ?? null,
      rating: parsed.data.rating ?? null,
      createdAt: new Date().toISOString(),
      ...derived
    };
    await saveSessions([...sessions, newSession]);
    res.status(201).json(newSession);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});
app.put("/api/sessions/:id", async (req, res) => {
  const parsed = sessionUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid session update payload" });
  const [sessions, topics, projects] = await Promise.all([getSessions(), getTopics(), getProjects()]);
  const idx = sessions.findIndex((s) => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: "Session not found" });

  try {
    const next = { ...sessions[idx], ...parsed.data };
    const derived = deriveSessionHierarchy(next, topics, projects);
    sessions[idx] = { ...next, ...derived };
    await saveSessions(sessions);
    res.json(sessions[idx]);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});
app.delete("/api/sessions/:id", async (req, res) => {
  const sessions = await getSessions();
  await saveSessions(sessions.filter((session) => session.id !== req.params.id));
  res.status(204).send();
});

app.post("/api/import", async (req, res) => {
  try { res.json(await replaceAll(req.body)); } catch { res.status(400).json({ error: "Invalid import payload" }); }
});
app.get("/api/export", async (_req, res) => res.json(await exportAll()));

const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist, {
  setHeaders: (res, servedPath) => {
    if (servedPath.endsWith("index.html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return;
    }

    if (servedPath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  }
}));
app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(clientDist, "index.html"));
});

initializeData().then(() => app.listen(port, () => console.log(`Server listening on http://localhost:${port}`)));
