import React from "react";
import { addDays, format, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell, BarChart, Bar, XAxis, YAxis, LineChart, Line } from "recharts";
import { SessionRecord, Settings, Topic } from "../types";
import { dateLabel, focusMinutesByDay, formatMinutes, sessionsToday, sumFocusMinutes } from "../utils/time";
import GoalRing from "./GoalRing";
import HistoryTable from "./HistoryTable";

interface StatsDashboardProps {
  settings: Settings;
  sessions: SessionRecord[];
  topics: Topic[];
  onUpdateSession: (id: string, patch: Partial<Pick<SessionRecord, "topicId" | "topicName" | "note">>) => void;
  onDeleteSession: (id: string) => void;
}

export default function StatsDashboard({
  settings,
  sessions,
  topics,
  onUpdateSession,
  onDeleteSession
}: StatsDashboardProps) {
  const todaySessions = sessionsToday(sessions);
  const todayFocusMinutes = sumFocusMinutes(todaySessions);

  const dailyMinutes = focusMinutesByDay(sessions, 7).map((item) => ({
    name: dateLabel(item.date),
    minutes: item.minutes
  }));

  const monthlyMinutes = focusMinutesByDay(sessions, 30).map((item) => ({
    name: format(item.date, "MMM d"),
    minutes: item.minutes
  }));

  const topicTotals = topics
    .map((topic) => {
      const minutes = sessions
        .filter((session) => session.type === "focus" && session.topicId === topic.id)
        .reduce((sum, session) => sum + session.durationSeconds / 60, 0);
      return { name: topic.name, value: Math.round(minutes), color: topic.color };
    })
    .filter((item) => item.value > 0);

  const mostFocusedTopic = topicTotals.sort((a, b) => b.value - a.value)[0]?.name ?? "—";

  const streakDays = Array.from({ length: 14 }).reduce<number>((count, _, index) => {
  const streakDays = Array.from({ length: 14 }).reduce((count, _, index) => {
    const date = startOfDay(addDays(new Date(), -index));
    const minutes = sessions
      .filter((session) => session.type === "focus")
      .filter((session) => startOfDay(new Date(session.startTime)).getTime() === date.getTime())
      .reduce((sum, session) => sum + session.durationSeconds / 60, 0);
    if (minutes >= settings.streakGoalMinutes) {
      return count + 1;
    }
    return count;
  }, 0);

  const [filterFrom, setFilterFrom] = React.useState("");
  const [filterTo, setFilterTo] = React.useState("");
  const [filterTopic, setFilterTopic] = React.useState("");
  const [filterType, setFilterType] = React.useState("all");

  const filteredSessions = sessions.filter((session) => {
    const sessionDate = parseISO(session.startTime);
    const afterFrom = filterFrom ? isAfter(sessionDate, startOfDay(parseISO(filterFrom))) || sessionDate.getTime() === startOfDay(parseISO(filterFrom)).getTime() : true;
    const beforeTo = filterTo ? isBefore(sessionDate, addDays(startOfDay(parseISO(filterTo)), 1)) : true;
    const matchesTopic = filterTopic ? session.topicId === filterTopic : true;
    const matchesType = filterType !== "all" ? session.type === filterType : true;
    return afterFrom && beforeTo && matchesTopic && matchesType;
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-3xl bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold">Today</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase text-slate-400">Focus time</p>
              <p className="text-2xl font-semibold">{formatMinutes(todayFocusMinutes)}</p>
            </div>
            <div className="rounded-2xl bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase text-slate-400">Sessions</p>
              <p className="text-2xl font-semibold">{todaySessions.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-950 px-4 py-3">
              <p className="text-xs uppercase text-slate-400">Streak days</p>
              <p className="text-2xl font-semibold">{streakDays}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Most-focused topic: <span className="text-slate-100">{mostFocusedTopic}</span>
          </p>
        </div>
        <div className="rounded-3xl bg-slate-900/60 p-6 flex items-center justify-center">
          <GoalRing progressMinutes={todayFocusMinutes} goalMinutes={settings.dailyGoalMinutes} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold mb-4">Weekly focus minutes</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyMinutes}>
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip />
                <Bar dataKey="minutes" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-3xl bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold mb-4">Topic breakdown</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={topicTotals} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {topicTotals.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold mb-4">Trends (last 30 days)</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyMinutes}>
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} interval={4} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="minutes" stroke="#a855f7" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-900/60 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">History</h3>
            <p className="text-sm text-slate-400">Filter by date, topic, or session type.</p>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <input
              type="date"
              className="rounded-xl bg-slate-950 px-3 py-2 text-xs"
              value={filterFrom}
              onChange={(event) => setFilterFrom(event.target.value)}
            />
            <input
              type="date"
              className="rounded-xl bg-slate-950 px-3 py-2 text-xs"
              value={filterTo}
              onChange={(event) => setFilterTo(event.target.value)}
            />
            <select
              className="rounded-xl bg-slate-950 px-3 py-2 text-xs"
              value={filterTopic}
              onChange={(event) => setFilterTopic(event.target.value)}
            >
              <option value="">All topics</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl bg-slate-950 px-3 py-2 text-xs"
              value={filterType}
              onChange={(event) => setFilterType(event.target.value)}
            >
              <option value="all">All types</option>
              <option value="focus">Focus</option>
              <option value="break">Break</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <HistoryTable sessions={filteredSessions} topics={topics} onUpdate={onUpdateSession} onDelete={onDeleteSession} />
        </div>
      </div>
    </div>
  );
}
