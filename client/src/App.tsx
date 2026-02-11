import { useEffect, useMemo, useState } from "react";
import { addDays, endOfWeek, format, isSameDay, parseISO, startOfDay, startOfWeek, subDays } from "date-fns";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SettingsPanel from "./components/SettingsPanel";
import { DataClient, createDataClient } from "./utils/dataClient";
import { Goal, Project, SessionRecord, Settings, TimerPhase, TimerState, Topic } from "./types";
import { formatDuration } from "./utils/time";

const defaultSettings: Settings = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartBreaks: true, autoStartFocus: false, trackBreaks: true, dailyGoalMinutes: 120, streakGoalMinutes: 60, useLocalStorageFallback: false };
const phaseSeconds = (s: Settings, p: TimerPhase) => (p === "focus" ? s.focusMinutes * 60 : p === "shortBreak" ? s.shortBreakMinutes * 60 : s.longBreakMinutes * 60);

const initialTimer: TimerState = { phase: "focus", remainingSeconds: 25 * 60, isRunning: false, startedAt: null, phaseStartedAt: null, currentGoalId: null, currentProjectId: null, currentTopicId: null, completedFocusSessions: 0 };

const clamp5 = (n: number) => Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5;

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
  const [weekStart, setWeekStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));

  const activeGoals = goals.filter((g) => !g.archived);
  const activeProjects = projects.filter((p) => !p.archived);
  const activeTopics = topics.filter((t) => !t.archived);
  const selectedGoal = activeGoals.find((g) => g.id === timer.currentGoalId) ?? null;
  const scopedProjects = activeProjects.filter((p) => p.goalId === timer.currentGoalId);
  const scopedTopics = activeTopics.filter((t) => t.projectId === timer.currentProjectId);

  const loadAll = async (dc: DataClient) => {
    const [s, g, p, t, sess] = await Promise.all([dc.getSettings(), dc.getGoals(), dc.getProjects(), dc.getTopics(), dc.getSessions()]);
    setSettings(s); setGoals(g); setProjects(p); setTopics(t); setSessions(sess);
    setTimer((prev) => ({ ...prev, remainingSeconds: phaseSeconds(s, prev.phase), currentGoalId: prev.currentGoalId ?? g.find((x) => !x.archived)?.id ?? null }));
  };

  useEffect(() => { createDataClient(false).then((dc) => { setClient(dc); loadAll(dc); }); }, []);

  useEffect(() => {
    if (!timer.isRunning) return;
    const id = window.setInterval(() => setTimer((prev) => {
      if (prev.remainingSeconds > 1) return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
      completePhase(prev);
      return prev;
    }), 1000);
    return () => window.clearInterval(id);
  }, [timer.isRunning, settings]);

  const completePhase = async (state: TimerState) => {
    if (!client) return;
    const now = new Date();
    const topic = activeTopics.find((t) => t.id === state.currentTopicId) ?? null;
    const newSession = await client.createSession({
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
    setSessions((prev) => [...prev, newSession]);
    if (newSession.type === "focus") { setRatingTarget(newSession); setDraftNote(newSession.note ?? ""); }
    const focusCount = state.phase === "focus" ? state.completedFocusSessions + 1 : state.completedFocusSessions;
    const nextPhase: TimerPhase = state.phase === "focus" ? (focusCount % settings.longBreakInterval === 0 ? "longBreak" : "shortBreak") : "focus";
    setTimer((prev) => ({ ...prev, phase: nextPhase, remainingSeconds: phaseSeconds(settings, nextPhase), isRunning: nextPhase === "focus" ? settings.autoStartFocus : settings.autoStartBreaks, completedFocusSessions: focusCount }));
  };

  const buckets = useMemo(() => {
    const map = new Map<string, { date: string; minutes: number; count: number }>();
    for (let i = 364; i >= 0; i -= 1) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      map.set(d, { date: d, minutes: 0, count: 0 });
    }
    sessions.filter((s) => s.type === "focus").forEach((s) => {
      const key = format(parseISO(s.startTime), "yyyy-MM-dd");
      const entry = map.get(key);
      if (!entry) return;
      entry.minutes += s.durationSeconds / 60;
      entry.count += 1;
    });
    return [...map.values()];
  }, [sessions]);

  const weekData = useMemo(() => {
    const start = startOfWeek(parseISO(`${weekStart}T00:00:00.000Z`), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      const daySessions = sessions.filter((s) => s.type === "focus" && isSameDay(parseISO(s.startTime), day));
      const minutes = daySessions.reduce((a, b) => a + b.durationSeconds / 60, 0);
      return { day: format(day, "EEE"), minutes, sessions: daySessions.length };
    });
  }, [sessions, weekStart]);

  const insights = useMemo(() => {
    const recent = sessions.filter((s) => s.type === "focus" && parseISO(s.startTime) >= subDays(new Date(), 30));
    const byHour = Array.from({ length: 24 }, (_, h) => ({ h, m: recent.filter((s) => parseISO(s.startTime).getHours() === h).reduce((a, b) => a + b.durationSeconds / 60, 0) }));
    const bestHour = byHour.sort((a, b) => b.m - a.m)[0];
    const dow = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, m: recent.filter((s) => parseISO(s.startTime).getDay() === d).reduce((a, b) => a + b.durationSeconds / 60, 0) }));
    const bestDow = dow.sort((a, b) => b.m - a.m)[0];
    const days = Array.from({ length: 30 }, (_, i) => startOfDay(subDays(new Date(), i)));
    const consistent = days.filter((d) => recent.some((s) => isSameDay(parseISO(s.startTime), d) && s.durationSeconds / 60 >= 25)).length;
    const last7 = recent.filter((s) => parseISO(s.startTime) >= subDays(new Date(), 7)).reduce((a, b) => a + b.durationSeconds / 60, 0);
    const prev7 = recent.filter((s) => parseISO(s.startTime) < subDays(new Date(), 7) && parseISO(s.startTime) >= subDays(new Date(), 14)).reduce((a, b) => a + b.durationSeconds / 60, 0);
    const trend = prev7 ? ((last7 - prev7) / prev7) * 100 : 0;
    const morning = recent.filter((s) => parseISO(s.startTime).getHours() < 12).reduce((a, b) => a + b.durationSeconds, 0);
    const evening = recent.filter((s) => parseISO(s.startTime).getHours() >= 17).reduce((a, b) => a + b.durationSeconds, 0);
    return { bestHour, bestDow, consistent, trend, periodBias: morning > evening ? "mornings" : "evenings" };
  }, [sessions]);

  const heatMax = Math.max(...buckets.map((b) => b.minutes), 1);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between"><h1 className="text-2xl font-bold">MyPomodoro</h1>
          <nav className="flex gap-2">{["timer", "history", "analytics", "planning", "settings"].map((t) => <button key={t} className={`px-3 py-1 rounded ${tab === t ? "bg-white text-black" : "bg-slate-800"}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</nav>
        </header>

        {tab === "timer" && <section className="grid md:grid-cols-2 gap-4 bg-slate-900/60 rounded-xl p-4">
          <div className="space-y-3">
            <div className="text-5xl font-bold">{formatDuration(timer.remainingSeconds)}</div>
            <div>Phase: {timer.phase}</div>
            <button className="bg-emerald-500 text-black px-4 py-2 rounded mr-2" disabled={timer.phase === "focus" && !timer.currentTopicId} onClick={() => setTimer((p) => ({ ...p, isRunning: !p.isRunning }))}>{timer.isRunning ? "Pause" : "Start"}</button>
            <button className="bg-slate-700 px-4 py-2 rounded" onClick={() => setTimer((p) => ({ ...p, remainingSeconds: phaseSeconds(settings, p.phase), isRunning: false }))}>Reset</button>
          </div>
          <div className="space-y-2">
            <select className="w-full bg-slate-950 p-2 rounded" value={timer.currentGoalId ?? ""} onChange={(e) => setTimer((p) => ({ ...p, currentGoalId: e.target.value || null, currentProjectId: null, currentTopicId: null }))}><option value="">Goal</option>{activeGoals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
            <select className="w-full bg-slate-950 p-2 rounded" value={timer.currentProjectId ?? ""} onChange={(e) => setTimer((p) => ({ ...p, currentProjectId: e.target.value || null, currentTopicId: null }))}><option value="">Project</option>{scopedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <input className="w-full bg-slate-950 p-2 rounded" placeholder="Quick search topic" onChange={(e) => {
              const found = scopedTopics.find((t) => t.name.toLowerCase().includes(e.target.value.toLowerCase()));
              if (found) setTimer((p) => ({ ...p, currentTopicId: found.id }));
            }} />
            <select className="w-full bg-slate-950 p-2 rounded" value={timer.currentTopicId ?? ""} onChange={(e) => setTimer((p) => ({ ...p, currentTopicId: e.target.value || null }))}><option value="">Topic</option>{scopedTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </div>
        </section>}

        {tab === "history" && <section className="bg-slate-900/60 rounded-xl p-4 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Date</th><th>Topic</th><th>Type</th><th>Min</th><th>Rating</th><th>Note</th></tr></thead><tbody>{sessions.slice().reverse().map((s) => <tr key={s.id}><td>{format(parseISO(s.startTime), "MMM d HH:mm")}</td><td>{s.topicName ?? "-"}</td><td>{s.type}</td><td>{Math.round(s.durationSeconds / 60)}</td><td><select value={s.rating ?? ""} onChange={async (e) => { if (!client) return; const updated = await client.updateSession(s.id, { rating: e.target.value ? clamp5(Number(e.target.value)) : null }); setSessions((prev) => prev.map((x) => x.id === s.id ? updated : x)); }}><option value="">-</option>{[1,2,3,4,5].map((r) => <option key={r} value={r}>{r}</option>)}</select></td><td><input value={s.note ?? ""} onBlur={async (e) => { if (!client) return; const updated = await client.updateSession(s.id, { note: e.target.value }); setSessions((prev) => prev.map((x) => x.id === s.id ? updated : x)); }} defaultValue={s.note ?? ""} /></td></tr>)}</tbody></table></section>}

        {tab === "planning" && <section className="grid md:grid-cols-3 gap-4">
          <Card title="Goals" items={activeGoals} onAdd={async (name) => { if (!client) return; const g = await client.createGoal({ name, description: "" }); setGoals((p) => [...p, g]); }} onArchive={async (id) => { if (!client) return; await client.deleteGoal(id); setGoals((prev) => prev.map((g) => g.id === id ? { ...g, archived: true } : g)); }} />
          <Card title="Projects" items={activeProjects.filter((p) => !selectedGoal || p.goalId === selectedGoal.id)} onAdd={async (name) => { if (!client || !timer.currentGoalId) return; const p = await client.createProject({ goalId: timer.currentGoalId, name, description: "", color: "#38bdf8" }); setProjects((x) => [...x, p]); }} onArchive={async (id) => { if (!client) return; await client.deleteProject(id); setProjects((prev) => prev.map((p) => p.id === id ? { ...p, archived: true } : p)); }} />
          <Card title="Topics" items={activeTopics.filter((t) => !timer.currentProjectId || t.projectId === timer.currentProjectId)} onAdd={async (name) => { if (!client) return; const t = await client.createTopic({ name, color: "#22c55e", projectId: timer.currentProjectId }); setTopics((x) => [...x, t]); }} onArchive={async (id) => { if (!client) return; await client.deleteTopic(id); setTopics((prev) => prev.map((t) => t.id === id ? { ...t, archived: true } : t)); }} />
        </section>}

        {tab === "analytics" && <section className="space-y-4">
          <div className="bg-slate-900/60 rounded-xl p-4"><h3 className="font-semibold mb-3">Heatmap (365 days)</h3><div className="grid grid-cols-53 gap-1 overflow-auto">{buckets.map((b) => <div key={b.date} title={`${b.date}: ${Math.round(b.minutes)}m (${b.count})`} className="h-3 w-3 rounded" style={{ backgroundColor: `rgba(34,197,94,${0.15 + (b.minutes / heatMax) * 0.85})` }} />)}</div></div>
          <div className="bg-slate-900/60 rounded-xl p-4"><h3 className="font-semibold mb-2">Weekly Review</h3><input type="date" className="bg-slate-950 p-2 rounded mb-3" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} /><div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart data={weekData}><XAxis dataKey="day" /><YAxis /><Tooltip /><Bar dataKey="minutes" fill="#22c55e" /></BarChart></ResponsiveContainer></div><p>Total: {Math.round(weekData.reduce((a,b)=>a+b.minutes,0))}m | Sessions: {weekData.reduce((a,b)=>a+b.sessions,0)} | Goal completion: {Math.round((weekData.reduce((a,b)=>a+b.minutes,0)/(settings.dailyGoalMinutes*7))*100)}%</p></div>
          <div className="bg-slate-900/60 rounded-xl p-4"><h3 className="font-semibold mb-2">Smart Insights (30 days)</h3><div className="grid md:grid-cols-3 gap-3 text-sm"><Insight title="Best hour" value={`${insights.bestHour?.h ?? 0}:00`} /><Insight title="Best day" value={["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][insights.bestDow?.d ?? 1]} /><Insight title="Consistency" value={`${insights.consistent}/30 days >= 25m`} /><Insight title="Trend" value={`${insights.trend.toFixed(1)}% vs prior week`} /><Insight title="Focus window" value={`You focus more in ${insights.periodBias}`} /></div><div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={activeTopics.map((t)=>({name:t.name,value:sessions.filter((s)=>s.topicId===t.id&&s.type==='focus').reduce((a,b)=>a+b.durationSeconds/60,0)})).filter((x)=>x.value>0)} dataKey="value" nameKey="name" outerRadius={70}>{activeTopics.map((t, i) => <Cell key={t.id} fill={["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#14b8a6"][i % 5]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
        </section>}

        {tab === "settings" && <SettingsPanel settings={settings} mode={client?.mode ?? "server"} onSave={async (s) => { if (!client) return; const saved = await client.updateSettings(s); setSettings(saved); }} onExport={async () => { if (!client) return; const payload = await client.exportAll(); const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "mypomodoro-backup.json"; a.click(); URL.revokeObjectURL(url); }} onImport={async (file) => { if (!client) return; const imported = await client.importAll(JSON.parse(await file.text())); setSettings(imported.settings); setGoals(imported.goals); setProjects(imported.projects); setTopics(imported.topics); setSessions(imported.sessions); }} />}
      </div>

      {ratingTarget && <div className="fixed inset-0 bg-black/50 flex items-center justify-center"><div className="bg-slate-900 rounded-xl p-4 space-y-3 w-96"><h3 className="font-semibold">Rate this session (1-5)</h3><input type="range" min={1} max={5} value={draftRating} onChange={(e) => setDraftRating(clamp5(Number(e.target.value)))} className="w-full" /><textarea className="w-full bg-slate-950 rounded p-2" placeholder="Optional note" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} /><div className="flex justify-end gap-2"><button className="px-3 py-1 bg-slate-700 rounded" onClick={() => setRatingTarget(null)}>Skip</button><button className="px-3 py-1 bg-emerald-500 text-black rounded" onClick={async () => { if (!client || !ratingTarget) return; const updated = await client.updateSession(ratingTarget.id, { rating: draftRating, note: draftNote || null }); setSessions((prev) => prev.map((s) => s.id === updated.id ? updated : s)); setRatingTarget(null); }}>Save</button></div></div></div>}
    </div>
  );
}

function Card({ title, items, onAdd, onArchive }: { title: string; items: Array<{ id: string; name: string }>; onAdd: (name: string) => void; onArchive: (id: string) => void }) {
  const [name, setName] = useState("");
  return <div className="bg-slate-900/60 rounded-xl p-4"><h3 className="font-semibold mb-2">{title}</h3><div className="flex gap-2 mb-3"><input className="bg-slate-950 rounded p-2 flex-1" value={name} onChange={(e) => setName(e.target.value)} /><button className="bg-emerald-500 text-black rounded px-3" onClick={() => { if (!name.trim()) return; onAdd(name.trim()); setName(""); }}>Add</button></div><ul className="space-y-1 text-sm">{items.map((item) => <li key={item.id} className="flex justify-between bg-slate-950 rounded px-2 py-1"><span>{item.name}</span><button className="text-rose-300" onClick={() => onArchive(item.id)}>Archive</button></li>)}</ul></div>;
}

function Insight({ title, value }: { title: string; value: string }) { return <div className="bg-slate-950 rounded p-2"><div className="text-slate-400 text-xs">{title}</div><div>{value}</div></div>; }
