import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays
} from "date-fns";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SettingsPanel from "./components/SettingsPanel";
import { DataClient, createDataClient } from "./utils/dataClient";
import { Goal, Project, SessionRecord, Settings, TimerPhase, TimerState, Topic } from "./types";
import { formatDuration } from "./utils/time";

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

const initialTimer: TimerState = {
  phase: "focus",
  remainingSeconds: 25 * 60,
  isRunning: false,
  startedAt: null,
  phaseStartedAt: null,
  currentGoalId: null,
  currentProjectId: null,
  currentTopicId: null,
  completedFocusSessions: 0
};

const phaseSeconds = (s: Settings, p: TimerPhase) =>
  p === "focus" ? s.focusMinutes * 60 : p === "shortBreak" ? s.shortBreakMinutes * 60 : s.longBreakMinutes * 60;

const clamp5 = (n: number) => Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5;

interface ScopeFilter {
  goalId: string;
  projectId: string;
  topicId: string;
}

export default function App() {
  const [client, setClient] = useState<DataClient | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [tab, setTab] = useState("timer");
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const [ratingTarget, setRatingTarget] = useState<SessionRecord | null>(null);
  const [draftRating, setDraftRating] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [draftNote, setDraftNote] = useState("");
  const [historyNotes, setHistoryNotes] = useState<Record<string, string>>({});
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [scope, setScope] = useState<ScopeFilter>({ goalId: "", projectId: "", topicId: "" });

  const activeGoals = useMemo(() => goals.filter((g) => !g.archived), [goals]);
  const activeProjects = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const activeTopics = useMemo(() => topics.filter((t) => !t.archived), [topics]);

  const timerProjects = useMemo(
    () => activeProjects.filter((p) => !timer.currentGoalId || p.goalId === timer.currentGoalId),
    [activeProjects, timer.currentGoalId]
  );
  const timerTopics = useMemo(
    () => activeTopics.filter((t) => !timer.currentProjectId || t.projectId === timer.currentProjectId),
    [activeTopics, timer.currentProjectId]
  );

  const scopedProjects = useMemo(
    () => activeProjects.filter((p) => !scope.goalId || p.goalId === scope.goalId),
    [activeProjects, scope.goalId]
  );
  const scopedTopics = useMemo(
    () => activeTopics.filter((t) => !scope.projectId || t.projectId === scope.projectId),
    [activeTopics, scope.projectId]
  );

  const filteredSessions = useMemo(
    () =>
      sessions.filter(
        (s) =>
          (!scope.goalId || s.goalId === scope.goalId) &&
          (!scope.projectId || s.projectId === scope.projectId) &&
          (!scope.topicId || s.topicId === scope.topicId)
      ),
    [scope, sessions]
  );

  const loadAll = async (dc: DataClient) => {
    const [loadedSettings, loadedGoals, loadedProjects, loadedTopics, loadedSessions] = await Promise.all([
      dc.getSettings(),
      dc.getGoals(),
      dc.getProjects(),
      dc.getTopics(),
      dc.getSessions()
    ]);
    setSettings(loadedSettings);
    setGoals(loadedGoals);
    setProjects(loadedProjects);
    setTopics(loadedTopics);
    setSessions(loadedSessions);
    setTimer((prev) => ({ ...prev, remainingSeconds: phaseSeconds(loadedSettings, prev.phase) }));
  };

  useEffect(() => {
    createDataClient(false).then((dc) => {
      setClient(dc);
      loadAll(dc);
    });
  }, []);

  useEffect(() => {
    if (!timer.isRunning) {
      return;
    }
    const id = window.setInterval(() => {
      setTimer((prev) => {
        if (prev.remainingSeconds > 1) {
          return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
        }
        void completePhase(prev);
        return prev;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timer.isRunning, settings, activeTopics]);

  const completePhase = async (state: TimerState) => {
    if (!client) {
      return;
    }
    const now = new Date();
    const topic = activeTopics.find((t) => t.id === state.currentTopicId) ?? null;
    const created = await client.createSession({
      type: state.phase === "focus" ? "focus" : "break",
      goalId: state.currentGoalId,
      projectId: state.currentProjectId,
      topicId: state.currentTopicId,
      topicName: topic?.name ?? null,
      note: null,
      rating: null,
      startTime: new Date(now.getTime() - phaseSeconds(settings, state.phase) * 1000).toISOString(),
      endTime: now.toISOString(),
      durationSeconds: phaseSeconds(settings, state.phase)
    });
    setSessions((prev) => [...prev, created]);
    if (created.type === "focus") {
      setRatingTarget(created);
      setDraftNote(created.note ?? "");
    }

    const focusCount = state.phase === "focus" ? state.completedFocusSessions + 1 : state.completedFocusSessions;
    const nextPhase: TimerPhase =
      state.phase === "focus" ? (focusCount % settings.longBreakInterval === 0 ? "longBreak" : "shortBreak") : "focus";
    setTimer((prev) => ({
      ...prev,
      phase: nextPhase,
      remainingSeconds: phaseSeconds(settings, nextPhase),
      isRunning: nextPhase === "focus" ? settings.autoStartFocus : settings.autoStartBreaks,
      completedFocusSessions: focusCount
    }));
  };

  const focusSessions = useMemo(() => filteredSessions.filter((s) => s.type === "focus"), [filteredSessions]);

  const heatmap = useMemo(() => {
    const dates = eachDayOfInterval({ start: subDays(startOfDay(new Date()), 364), end: startOfDay(new Date()) });
    const map = new Map<string, { date: string; minutes: number; count: number }>();
    dates.forEach((date) => map.set(format(date, "yyyy-MM-dd"), { date: format(date, "yyyy-MM-dd"), minutes: 0, count: 0 }));

    focusSessions.forEach((session) => {
      const key = format(parseISO(session.startTime), "yyyy-MM-dd");
      const bucket = map.get(key);
      if (!bucket) return;
      bucket.minutes += session.durationSeconds / 60;
      bucket.count += 1;
    });

    return Array.from(map.values());
  }, [focusSessions]);

  const weekStats = useMemo(() => {
    const weekStartDate = startOfWeek(parseISO(`${weekStart}T00:00:00.000Z`), { weekStartsOn: 1 });
    const weekEndDate = endOfWeek(weekStartDate, { weekStartsOn: 1 });
    const weekSessions = focusSessions.filter((s) => {
      const date = parseISO(s.startTime);
      return date >= weekStartDate && date <= weekEndDate;
    });

    const dayRows = Array.from({ length: 7 }, (_, index) => {
      const day = addDays(weekStartDate, index);
      const rows = weekSessions.filter((s) => isSameDay(parseISO(s.startTime), day));
      const minutes = rows.reduce((sum, s) => sum + s.durationSeconds / 60, 0);
      return { day: format(day, "EEE"), minutes, sessions: rows.length };
    });

    const totalMinutes = dayRows.reduce((sum, row) => sum + row.minutes, 0);
    const bestDay = [...dayRows].sort((a, b) => b.minutes - a.minutes)[0];
    const worstDay = [...dayRows].sort((a, b) => a.minutes - b.minutes)[0];

    const topicMinutes = activeTopics
      .map((topic) => ({
        topic,
        minutes: weekSessions
          .filter((s) => s.topicId === topic.id)
          .reduce((sum, s) => sum + s.durationSeconds / 60, 0)
      }))
      .sort((a, b) => b.minutes - a.minutes);

    const ratings = weekSessions.map((s) => s.rating).filter((r): r is 1 | 2 | 3 | 4 | 5 => typeof r === "number");

    const streakDates = new Set(
      focusSessions
        .filter((s) => s.durationSeconds / 60 >= settings.streakGoalMinutes)
        .map((s) => format(parseISO(s.startTime), "yyyy-MM-dd"))
    );
    let streak = 0;
    for (let i = 0; i < 365; i += 1) {
      const key = format(subDays(startOfDay(new Date()), i), "yyyy-MM-dd");
      if (!streakDates.has(key)) break;
      streak += 1;
    }

    return {
      dayRows,
      totalMinutes,
      sessionsCount: weekSessions.length,
      goalCompletion: Math.round((totalMinutes / (settings.dailyGoalMinutes * 7)) * 100),
      bestDay: bestDay?.day ?? "-",
      worstDay: worstDay?.day ?? "-",
      topTopic: topicMinutes[0]?.topic.name ?? "-",
      avgRating: ratings.length ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(2) : "-",
      streak
    };
  }, [activeTopics, focusSessions, settings.dailyGoalMinutes, settings.streakGoalMinutes, weekStart]);

  const insights = useMemo(() => {
    const rangeStart = subDays(startOfDay(new Date()), 29);
    const inRange = focusSessions.filter((s) => parseISO(s.startTime) >= rangeStart);

    const hours = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      minutes: inRange
        .filter((s) => parseISO(s.startTime).getHours() === h)
        .reduce((sum, s) => sum + s.durationSeconds / 60, 0)
    }));

    const weekdays = Array.from({ length: 7 }, (_, d) => ({
      day: d,
      minutes: inRange
        .filter((s) => parseISO(s.startTime).getDay() === d)
        .reduce((sum, s) => sum + s.durationSeconds / 60, 0)
    }));

    const consistencyDays = eachDayOfInterval({ start: rangeStart, end: startOfDay(new Date()) });
    const consistencyHits = consistencyDays.filter((day) =>
      inRange.some((s) => isSameDay(parseISO(s.startTime), day) && s.durationSeconds / 60 >= 25)
    ).length;

    const last7 = inRange
      .filter((s) => parseISO(s.startTime) >= subDays(new Date(), 7))
      .reduce((sum, s) => sum + s.durationSeconds / 60, 0);
    const previous7 = inRange
      .filter((s) => parseISO(s.startTime) < subDays(new Date(), 7) && parseISO(s.startTime) >= subDays(new Date(), 14))
      .reduce((sum, s) => sum + s.durationSeconds / 60, 0);

    const durationBuckets = [
      { label: "15-20", min: 15, max: 20 },
      { label: "20-25", min: 20, max: 25 },
      { label: "25-30", min: 25, max: 30 },
      { label: "30-40", min: 30, max: 40 },
      { label: "40+", min: 40, max: Infinity }
    ].map((bucket) => {
      const rows = inRange.filter((s) => {
        const mins = s.durationSeconds / 60;
        return mins >= bucket.min && mins < bucket.max;
      });
      const ratings = rows.map((s) => s.rating).filter((r): r is 1 | 2 | 3 | 4 | 5 => typeof r === "number");
      return {
        label: bucket.label,
        sessions: rows.length,
        avgRating: ratings.length ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0
      };
    });

    const bestDuration = [...durationBuckets].sort((a, b) => {
      if (a.avgRating && b.avgRating) return b.avgRating - a.avgRating;
      return b.sessions - a.sessions;
    })[0];

    const churn = consistencyDays.map((day) => {
      const ids = new Set(
        inRange
          .filter((s) => isSameDay(parseISO(s.startTime), day) && s.topicId)
          .map((s) => s.topicId as string)
      );
      return ids.size;
    });

    const morning = inRange
      .filter((s) => parseISO(s.startTime).getHours() >= 5 && parseISO(s.startTime).getHours() < 12)
      .reduce((sum, s) => sum + s.durationSeconds, 0);
    const evening = inRange
      .filter((s) => parseISO(s.startTime).getHours() >= 17)
      .reduce((sum, s) => sum + s.durationSeconds, 0);

    return {
      bestHour: [...hours].sort((a, b) => b.minutes - a.minutes)[0],
      bestWeekday: [...weekdays].sort((a, b) => b.minutes - a.minutes)[0],
      consistency: `${consistencyHits}/${consistencyDays.length}`,
      trend: previous7 > 0 ? (((last7 - previous7) / previous7) * 100).toFixed(1) : "0.0",
      bestDuration,
      topicChurn: (churn.reduce((sum, n) => sum + n, 0) / Math.max(1, churn.length)).toFixed(2),
      periodBias: morning >= evening ? "mornings" : "evenings"
    };
  }, [focusSessions]);

  const heatMax = Math.max(...heatmap.map((b) => b.minutes), 1);

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">MyPomodoro</h1>
          <nav className="flex flex-wrap gap-2">
            {["timer", "history", "analytics", "planning", "settings"].map((item) => (
              <button
                key={item}
                className={`rounded px-3 py-1 ${tab === item ? "bg-white text-black" : "bg-slate-800"}`}
                onClick={() => setTab(item)}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </nav>
        </header>

        {(tab === "history" || tab === "analytics") && (
          <section className="rounded-xl bg-slate-900/60 p-4">
            <h3 className="mb-2 text-sm uppercase tracking-wide text-slate-400">Filter scope (global or specific)</h3>
            <div className="grid gap-2 md:grid-cols-3">
              <select
                className="rounded bg-slate-950 p-2"
                value={scope.goalId}
                onChange={(e) => setScope({ goalId: e.target.value, projectId: "", topicId: "" })}
              >
                <option value="">All goals</option>
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <select
                className="rounded bg-slate-950 p-2"
                value={scope.projectId}
                onChange={(e) => setScope((prev) => ({ ...prev, projectId: e.target.value, topicId: "" }))}
              >
                <option value="">All projects</option>
                {scopedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                className="rounded bg-slate-950 p-2"
                value={scope.topicId}
                onChange={(e) => setScope((prev) => ({ ...prev, topicId: e.target.value }))}
              >
                <option value="">All topics</option>
                {scopedTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {tab === "timer" && (
          <section className="grid gap-4 rounded-xl bg-slate-900/60 p-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-5xl font-bold">{formatDuration(timer.remainingSeconds)}</div>
              <div>Phase: {timer.phase}</div>
              <button
                className="mr-2 rounded bg-emerald-500 px-4 py-2 text-black"
                disabled={timer.phase === "focus" && !timer.currentTopicId}
                onClick={() => setTimer((prev) => ({ ...prev, isRunning: !prev.isRunning }))}
              >
                {timer.isRunning ? "Pause" : "Start"}
              </button>
              <button
                className="rounded bg-slate-700 px-4 py-2"
                onClick={() =>
                  setTimer((prev) => ({
                    ...prev,
                    remainingSeconds: phaseSeconds(settings, prev.phase),
                    isRunning: false
                  }))
                }
              >
                Reset
              </button>
            </div>
            <div className="space-y-2">
              <select
                className="w-full rounded bg-slate-950 p-2"
                value={timer.currentGoalId ?? ""}
                onChange={(e) =>
                  setTimer((prev) => ({
                    ...prev,
                    currentGoalId: e.target.value || null,
                    currentProjectId: null,
                    currentTopicId: null
                  }))
                }
              >
                <option value="">Goal</option>
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded bg-slate-950 p-2"
                value={timer.currentProjectId ?? ""}
                onChange={(e) => setTimer((prev) => ({ ...prev, currentProjectId: e.target.value || null, currentTopicId: null }))}
              >
                <option value="">Project</option>
                {timerProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded bg-slate-950 p-2"
                placeholder="Quick search topic"
                onChange={(e) => {
                  const found = timerTopics.find((t) => t.name.toLowerCase().includes(e.target.value.toLowerCase()));
                  if (found) {
                    setTimer((prev) => ({ ...prev, currentTopicId: found.id }));
                  }
                }}
              />
              <select
                className="w-full rounded bg-slate-950 p-2"
                value={timer.currentTopicId ?? ""}
                onChange={(e) => setTimer((prev) => ({ ...prev, currentTopicId: e.target.value || null }))}
              >
                <option value="">Topic</option>
                {timerTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {tab === "history" && (
          <section className="overflow-auto rounded-xl bg-slate-900/60 p-4">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Topic</th>
                  <th>Type</th>
                  <th>Min</th>
                  <th>Rating</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions
                  .slice()
                  .reverse()
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{format(parseISO(s.startTime), "MMM d HH:mm")}</td>
                      <td>{s.topicName ?? "-"}</td>
                      <td>{s.type}</td>
                      <td>{Math.round(s.durationSeconds / 60)}</td>
                      <td>
                        <select
                          value={s.rating ?? ""}
                          onChange={async (e) => {
                            if (!client) return;
                            const updated = await client.updateSession(s.id, {
                              rating: e.target.value ? clamp5(Number(e.target.value)) : null
                            });
                            setSessions((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
                          }}
                        >
                          <option value="">-</option>
                          {[1, 2, 3, 4, 5].map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="rounded bg-slate-950 p-1"
                          value={historyNotes[s.id] ?? s.note ?? ""}
                          onChange={(e) => setHistoryNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          onBlur={async () => {
                            if (!client) return;
                            const note = historyNotes[s.id] ?? s.note ?? "";
                            const updated = await client.updateSession(s.id, { note: note || null });
                            setSessions((prev) => prev.map((x) => (x.id === s.id ? updated : x)));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === "planning" && (
          <section className="grid gap-4 md:grid-cols-3">
            <EntityCard
              title="Goals"
              items={activeGoals}
              onAdd={async (name) => {
                if (!client) return;
                const created = await client.createGoal({ name, description: "" });
                setGoals((prev) => [...prev, created]);
              }}
              onArchive={async (id) => {
                if (!client) return;
                await client.deleteGoal(id);
                setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, archived: true } : g)));
              }}
            />
            <EntityCard
              title="Projects"
              items={activeProjects.filter((p) => !timer.currentGoalId || p.goalId === timer.currentGoalId)}
              onAdd={async (name) => {
                if (!client || !timer.currentGoalId) return;
                const created = await client.createProject({
                  goalId: timer.currentGoalId,
                  name,
                  description: "",
                  color: "#38bdf8"
                });
                setProjects((prev) => [...prev, created]);
              }}
              onArchive={async (id) => {
                if (!client) return;
                await client.deleteProject(id);
                setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, archived: true } : p)));
              }}
            />
            <EntityCard
              title="Topics"
              items={activeTopics.filter((t) => !timer.currentProjectId || t.projectId === timer.currentProjectId)}
              onAdd={async (name) => {
                if (!client) return;
                const created = await client.createTopic({ name, color: "#22c55e", projectId: timer.currentProjectId });
                setTopics((prev) => [...prev, created]);
              }}
              onArchive={async (id) => {
                if (!client) return;
                await client.deleteTopic(id);
                setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, archived: true } : t)));
              }}
            />
          </section>
        )}

        {tab === "analytics" && (
          <section className="space-y-4">
            <div className="rounded-xl bg-slate-900/60 p-4">
              <h3 className="mb-3 font-semibold">Heatmap (365 days)</h3>
              <div className="grid grid-cols-[repeat(53,minmax(0,1fr))] gap-1 overflow-auto">
                {heatmap.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${Math.round(day.minutes)}m (${day.count} sessions)`}
                    className="h-3 w-3 rounded"
                    style={{ backgroundColor: `rgba(34,197,94,${0.15 + (day.minutes / heatMax) * 0.85})` }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-slate-900/60 p-4">
              <h3 className="mb-2 font-semibold">Weekly review</h3>
              <input
                type="date"
                className="mb-3 rounded bg-slate-950 p-2"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekStats.dayRows}>
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="minutes" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                <Insight title="Total focus" value={`${Math.round(weekStats.totalMinutes)}m`} />
                <Insight title="Sessions" value={String(weekStats.sessionsCount)} />
                <Insight title="Goal completion" value={`${weekStats.goalCompletion}%`} />
                <Insight title="Best day" value={weekStats.bestDay} />
                <Insight title="Worst day" value={weekStats.worstDay} />
                <Insight title="Most-focused topic" value={weekStats.topTopic} />
                <Insight title="Average rating" value={String(weekStats.avgRating)} />
                <Insight title="Current streak" value={`${weekStats.streak} days`} />
              </div>
            </div>

            <div className="rounded-xl bg-slate-900/60 p-4">
              <h3 className="mb-2 font-semibold">Smart insights (last 30 days)</h3>
              <div className="grid gap-2 md:grid-cols-3">
                <Insight title="Best hour block" value={`${insights.bestHour?.hour ?? 0}:00`} />
                <Insight title="Best day of week" value={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][insights.bestWeekday?.day ?? 0]} />
                <Insight title="Consistency score" value={insights.consistency} />
                <Insight title="7-day trend" value={`${insights.trend}%`} />
                <Insight
                  title="Session sweet spot"
                  value={`${insights.bestDuration?.label ?? "-"}${
                    insights.bestDuration?.avgRating
                      ? ` (avg rating ${insights.bestDuration.avgRating.toFixed(2)})`
                      : ` (${insights.bestDuration?.sessions ?? 0} sessions)`
                  }`}
                />
                <Insight title="Topic churn" value={`${insights.topicChurn} topics/day`} />
                <Insight title="Time-of-day signal" value={`You focus more in ${insights.periodBias}`} />
              </div>

              <div className="mt-3 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={activeTopics
                        .map((t) => ({
                          name: t.name,
                          value: focusSessions
                            .filter((s) => s.topicId === t.id)
                            .reduce((sum, s) => sum + s.durationSeconds / 60, 0)
                        }))
                        .filter((row) => row.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={70}
                    >
                      {activeTopics.map((t, index) => (
                        <Cell
                          key={t.id}
                          fill={["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#14b8a6"][index % 5]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        )}

        {tab === "settings" && (
          <SettingsPanel
            settings={settings}
            mode={client?.mode ?? "server"}
            onSave={async (updated) => {
              if (!client) return;
              const saved = await client.updateSettings(updated);
              setSettings(saved);
            }}
            onExport={async () => {
              if (!client) return;
              const payload = await client.exportAll();
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "mypomodoro-backup.json";
              anchor.click();
              URL.revokeObjectURL(url);
            }}
            onImport={async (file) => {
              if (!client) return;
              const imported = await client.importAll(JSON.parse(await file.text()));
              setSettings(imported.settings);
              setGoals(imported.goals);
              setProjects(imported.projects);
              setTopics(imported.topics);
              setSessions(imported.sessions);
            }}
          />
        )}
      </div>

      {ratingTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="w-96 space-y-3 rounded-xl bg-slate-900 p-4">
            <h3 className="font-semibold">Rate this session (1-5)</h3>
            <input
              type="range"
              min={1}
              max={5}
              value={draftRating}
              onChange={(e) => setDraftRating(clamp5(Number(e.target.value)))}
              className="w-full"
            />
            <textarea
              className="w-full rounded bg-slate-950 p-2"
              placeholder="Optional note"
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button className="rounded bg-slate-700 px-3 py-1" onClick={() => setRatingTarget(null)}>
                Skip
              </button>
              <button
                className="rounded bg-emerald-500 px-3 py-1 text-black"
                onClick={async () => {
                  if (!client || !ratingTarget) return;
                  const updated = await client.updateSession(ratingTarget.id, {
                    rating: draftRating,
                    note: draftNote || null
                  });
                  setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                  setRatingTarget(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EntityCard({
  title,
  items,
  onAdd,
  onArchive
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
  onAdd: (name: string) => void;
  onArchive: (id: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="rounded-xl bg-slate-900/60 p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <div className="mb-3 flex gap-2">
        <input className="flex-1 rounded bg-slate-950 p-2" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="rounded bg-emerald-500 px-3 text-black"
          onClick={() => {
            if (!name.trim()) return;
            onAdd(name.trim());
            setName("");
          }}
        >
          Add
        </button>
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex justify-between rounded bg-slate-950 px-2 py-1">
            <span>{item.name}</span>
            <button className="text-rose-300" onClick={() => onArchive(item.id)}>
              Archive
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Insight({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded bg-slate-950 p-2">
      <div className="text-xs text-slate-400">{title}</div>
      <div>{value}</div>
    </div>
  );
}
