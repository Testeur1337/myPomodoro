import { ExportPayload, SessionRecord, Settings, Topic } from "../types";

const settingsKey = "mypomodoro.settings";
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

function loadLocal<T>(key: string, fallback: T): T {
  const stored = localStorage.getItem(key);
  if (!stored) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
  try {
    return JSON.parse(stored) as T;
  } catch (error) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

function saveLocal<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data));
}

async function safeFetch<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error("Network error");
  }
  return (await response.json()) as T;
}

export interface DataClient {
  mode: "server" | "local";
  getSettings: () => Promise<Settings>;
  updateSettings: (settings: Settings) => Promise<Settings>;
  getTopics: () => Promise<Topic[]>;
  createTopic: (payload: Pick<Topic, "name" | "color">) => Promise<Topic>;
  updateTopic: (id: string, payload: Pick<Topic, "name" | "color">) => Promise<Topic>;
  deleteTopic: (id: string) => Promise<void>;
  getSessions: () => Promise<SessionRecord[]>;
  createSession: (session: Omit<SessionRecord, "id" | "createdAt">) => Promise<SessionRecord>;
  updateSession: (id: string, patch: Partial<Pick<SessionRecord, "topicId" | "topicName" | "note">>) => Promise<SessionRecord>;
  deleteSession: (id: string) => Promise<void>;
  exportAll: () => Promise<ExportPayload>;
  importAll: (payload: ExportPayload) => Promise<ExportPayload>;
}

async function buildServerClient(): Promise<DataClient> {
  return {
    mode: "server",
    getSettings: () => safeFetch<Settings>("/api/settings"),
    updateSettings: (settings) =>
      safeFetch<Settings>("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      }),
    getTopics: () => safeFetch<Topic[]>("/api/topics"),
    createTopic: (payload) =>
      safeFetch<Topic>("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    updateTopic: (id, payload) =>
      safeFetch<Topic>(`/api/topics/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    deleteTopic: async (id) => {
      await safeFetch(`/api/topics/${id}`, { method: "DELETE" });
    },
    getSessions: () => safeFetch<SessionRecord[]>("/api/sessions"),
    createSession: (session) =>
      safeFetch<SessionRecord>("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session)
      }),
    updateSession: (id, patch) =>
      safeFetch<SessionRecord>(`/api/sessions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      }),
    deleteSession: async (id) => {
      await safeFetch(`/api/sessions/${id}`, { method: "DELETE" });
    },
    exportAll: () => safeFetch<ExportPayload>("/api/export"),
    importAll: (payload) =>
      safeFetch<ExportPayload>("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
  };
}

function buildLocalClient(): DataClient {
  return {
    mode: "local",
    getSettings: async () => loadLocal(settingsKey, defaultSettings),
    updateSettings: async (settings) => {
      saveLocal(settingsKey, settings);
      return settings;
    },
    getTopics: async () => loadLocal(topicsKey, seedTopics),
    createTopic: async (payload) => {
      const topics = loadLocal(topicsKey, seedTopics);
      const newTopic: Topic = {
        id: crypto.randomUUID(),
        name: payload.name,
        color: payload.color,
        createdAt: new Date().toISOString()
      };
      const updated = [...topics, newTopic];
      saveLocal(topicsKey, updated);
      return newTopic;
    },
    updateTopic: async (id, payload) => {
      const topics = loadLocal(topicsKey, seedTopics);
      const updated = topics.map((topic) =>
        topic.id === id ? { ...topic, ...payload } : topic
      );
      saveLocal(topicsKey, updated);
      const found = updated.find((topic) => topic.id === id);
      if (!found) {
        throw new Error("Topic not found");
      }
      return found;
    },
    deleteTopic: async (id) => {
      const topics = loadLocal(topicsKey, seedTopics).filter((topic) => topic.id !== id);
      saveLocal(topicsKey, topics);
    },
    getSessions: async () => loadLocal(sessionsKey, [] as SessionRecord[]),
    createSession: async (session) => {
      const sessions = loadLocal(sessionsKey, [] as SessionRecord[]);
      const newSession: SessionRecord = {
        ...session,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };
      const updated = [...sessions, newSession];
      saveLocal(sessionsKey, updated);
      return newSession;
    },
    updateSession: async (id, patch) => {
      const sessions = loadLocal(sessionsKey, [] as SessionRecord[]);
      const updated = sessions.map((session) =>
        session.id === id ? { ...session, ...patch } : session
      );
      saveLocal(sessionsKey, updated);
      const found = updated.find((session) => session.id === id);
      if (!found) {
        throw new Error("Session not found");
      }
      return found;
    },
    deleteSession: async (id) => {
      const sessions = loadLocal(sessionsKey, [] as SessionRecord[]).filter(
        (session) => session.id !== id
      );
      saveLocal(sessionsKey, sessions);
    },
    exportAll: async () => ({
      settings: loadLocal(settingsKey, defaultSettings),
      topics: loadLocal(topicsKey, seedTopics),
      sessions: loadLocal(sessionsKey, [] as SessionRecord[])
    }),
    importAll: async (payload) => {
      saveLocal(settingsKey, payload.settings);
      saveLocal(topicsKey, payload.topics);
      saveLocal(sessionsKey, payload.sessions);
      return payload;
    }
  };
}

export async function createDataClient(forceLocal = false): Promise<DataClient> {
  if (forceLocal) {
    return buildLocalClient();
  }
  try {
    await safeFetch<Settings>("/api/settings");
    return buildServerClient();
  } catch (error) {
    return buildLocalClient();
  }
}
