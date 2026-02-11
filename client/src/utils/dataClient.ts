import { ExportPayload, Goal, Project, SessionRecord, Settings, Topic } from "../types";

const settingsKey = "mypomodoro.settings";
const goalsKey = "mypomodoro.goals";
const projectsKey = "mypomodoro.projects";
const topicsKey = "mypomodoro.topics";
const sessionsKey = "mypomodoro.sessions";

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

const forceLocalStorageMode = import.meta.env.VITE_FORCE_LOCAL_STORAGE === "true";

function loadLocal<T>(key: string, fallback: T): T {
  const stored = localStorage.getItem(key);
  if (!stored) { localStorage.setItem(key, JSON.stringify(fallback)); return fallback; }
  try { return JSON.parse(stored) as T; } catch { localStorage.setItem(key, JSON.stringify(fallback)); return fallback; }
}
const saveLocal = <T,>(key: string, data: T) => localStorage.setItem(key, JSON.stringify(data));

async function safeFetch<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error("Network error");
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface DataClient {
  mode: "server" | "local";
  getSettings: () => Promise<Settings>;
  updateSettings: (settings: Settings) => Promise<Settings>;
  getGoals: () => Promise<Goal[]>;
  createGoal: (payload: Pick<Goal, "name" | "description">) => Promise<Goal>;
  updateGoal: (id: string, payload: Partial<Goal>) => Promise<Goal>;
  deleteGoal: (id: string) => Promise<void>;
  getProjects: (goalId?: string) => Promise<Project[]>;
  createProject: (payload: Pick<Project, "goalId" | "name" | "description" | "color">) => Promise<Project>;
  updateProject: (id: string, payload: Partial<Project>) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  getTopics: (filters?: { goalId?: string; projectId?: string }) => Promise<Topic[]>;
  createTopic: (payload: Pick<Topic, "name" | "color" | "projectId">) => Promise<Topic>;
  updateTopic: (id: string, payload: Partial<Topic>) => Promise<Topic>;
  deleteTopic: (id: string) => Promise<void>;
  getSessions: (filters?: Record<string, string>) => Promise<SessionRecord[]>;
  createSession: (session: Pick<SessionRecord, "type" | "topicId" | "note" | "rating" | "startTime" | "endTime" | "durationSeconds">) => Promise<SessionRecord>;
  updateSession: (id: string, patch: Partial<SessionRecord>) => Promise<SessionRecord>;
  deleteSession: (id: string) => Promise<void>;
  exportAll: () => Promise<ExportPayload>;
  importAll: (payload: ExportPayload) => Promise<ExportPayload>;
}

const queryString = (params?: Record<string, string | undefined>) => {
  if (!params) return "";
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && query.set(k, v));
  const s = query.toString();
  return s ? `?${s}` : "";
};

async function buildServerClient(): Promise<DataClient> {
  return {
    mode: "server",
    getSettings: () => safeFetch("/api/settings"),
    updateSettings: (settings) => safeFetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }),
    getGoals: () => safeFetch("/api/goals"),
    createGoal: (payload) => safeFetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    updateGoal: (id, payload) => safeFetch(`/api/goals/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    deleteGoal: async (id) => { await safeFetch(`/api/goals/${id}`, { method: "DELETE" }); },
    getProjects: (goalId) => safeFetch(`/api/projects${queryString({ goalId })}`),
    createProject: (payload) => safeFetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    updateProject: (id, payload) => safeFetch(`/api/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    deleteProject: async (id) => { await safeFetch(`/api/projects/${id}`, { method: "DELETE" }); },
    getTopics: (filters) => safeFetch(`/api/topics${queryString(filters)}`),
    createTopic: (payload) => safeFetch("/api/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    updateTopic: (id, payload) => safeFetch(`/api/topics/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    deleteTopic: async (id) => { await safeFetch(`/api/topics/${id}`, { method: "DELETE" }); },
    getSessions: (filters) => safeFetch(`/api/sessions${queryString(filters)}`),
    createSession: (session) => safeFetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(session) }),
    updateSession: (id, patch) => safeFetch(`/api/sessions/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }),
    deleteSession: async (id) => { await safeFetch(`/api/sessions/${id}`, { method: "DELETE" }); },
    exportAll: () => safeFetch("/api/export"),
    importAll: (payload) => safeFetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
  };
}

function buildLocalClient(): DataClient {
  const getGoals = async () => loadLocal(goalsKey, [] as Goal[]);
  const getProjects = async (goalId?: string) => {
    const data = loadLocal(projectsKey, [] as Project[]);
    return goalId ? data.filter((p) => p.goalId === goalId) : data;
  };
  const getTopics = async (filters?: { goalId?: string; projectId?: string }) => {
    const topics = loadLocal(topicsKey, [] as Topic[]);
    const projects = loadLocal(projectsKey, [] as Project[]);
    const goalProjectIds = filters?.goalId ? projects.filter((p) => p.goalId === filters.goalId).map((p) => p.id) : null;
    return topics.filter((t) => (!filters?.projectId || t.projectId === filters.projectId) && (!goalProjectIds || goalProjectIds.includes(t.projectId)));
  };
  return {
    mode: "local",
    getSettings: async () => loadLocal(settingsKey, defaultSettings),
    updateSettings: async (settings) => (saveLocal(settingsKey, settings), settings),
    getGoals,
    createGoal: async (payload) => { const all = await getGoals(); const entry: Goal = { id: `g_${crypto.randomUUID()}`, name: payload.name, description: payload.description ?? "", createdAt: new Date().toISOString(), archived: false }; saveLocal(goalsKey, [...all, entry]); return entry; },
    updateGoal: async (id, payload) => { const all = await getGoals(); const next = all.map((g) => (g.id === id ? { ...g, ...payload } : g)); saveLocal(goalsKey, next); return next.find((g) => g.id === id)!; },
    deleteGoal: async (id) => { const all = await getGoals(); saveLocal(goalsKey, all.map((g) => (g.id === id ? { ...g, archived: true } : g))); },
    getProjects,
    createProject: async (payload) => { const all = await getProjects(); const entry: Project = { id: `p_${crypto.randomUUID()}`, goalId: payload.goalId, name: payload.name, description: payload.description ?? "", color: payload.color ?? "", createdAt: new Date().toISOString(), archived: false }; saveLocal(projectsKey, [...all, entry]); return entry; },
    updateProject: async (id, payload) => { const all = await getProjects(); const next = all.map((p) => (p.id === id ? { ...p, ...payload } : p)); saveLocal(projectsKey, next); return next.find((p) => p.id === id)!; },
    deleteProject: async (id) => { const all = await getProjects(); saveLocal(projectsKey, all.map((p) => (p.id === id ? { ...p, archived: true } : p))); },
    getTopics,
    createTopic: async (payload) => { if (!payload.projectId) throw new Error("projectId is required"); const all = await getTopics(); const entry: Topic = { id: `t_${crypto.randomUUID()}`, name: payload.name, color: payload.color, projectId: payload.projectId, createdAt: new Date().toISOString(), archived: false }; saveLocal(topicsKey, [...all, entry]); return entry; },
    updateTopic: async (id, payload) => { const all = await getTopics(); const next = all.map((t) => (t.id === id ? { ...t, ...payload } : t)); saveLocal(topicsKey, next); return next.find((t) => t.id === id)!; },
    deleteTopic: async (id) => { const all = await getTopics(); saveLocal(topicsKey, all.map((t) => (t.id === id ? { ...t, archived: true } : t))); },
    getSessions: async () => loadLocal(sessionsKey, [] as SessionRecord[]),
    createSession: async (session) => { const all = loadLocal(sessionsKey, [] as SessionRecord[]); if (session.type === "focus" && !session.topicId) throw new Error("Focus sessions require topicId"); const entry: SessionRecord = { ...session, goalId: null, projectId: null, topicName: null, id: `s_${crypto.randomUUID()}`, createdAt: new Date().toISOString() }; saveLocal(sessionsKey, [...all, entry]); return entry; },
    updateSession: async (id, patch) => { const all = loadLocal(sessionsKey, [] as SessionRecord[]); const next = all.map((s) => (s.id === id ? { ...s, ...patch } : s)); saveLocal(sessionsKey, next); return next.find((s) => s.id === id)!; },
    deleteSession: async (id) => saveLocal(sessionsKey, loadLocal(sessionsKey, [] as SessionRecord[]).filter((s) => s.id !== id)),
    exportAll: async () => ({ settings: loadLocal(settingsKey, defaultSettings), goals: await getGoals(), projects: await getProjects(), topics: await getTopics(), sessions: loadLocal(sessionsKey, [] as SessionRecord[]) }),
    importAll: async (payload) => { saveLocal(settingsKey, payload.settings); saveLocal(goalsKey, payload.goals ?? []); saveLocal(projectsKey, payload.projects ?? []); saveLocal(topicsKey, payload.topics); saveLocal(sessionsKey, payload.sessions); return payload; }
  };
}

export async function createDataClient(forceLocal = false): Promise<DataClient> {
  if (forceLocal || forceLocalStorageMode) return buildLocalClient();
  try { await safeFetch<Settings>("/api/settings"); return buildServerClient(); } catch { return buildLocalClient(); }
}
