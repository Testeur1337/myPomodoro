import { useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { DataClient } from "../../utils/dataClient";
import { PlannerDay, PlannerTask } from "../../types";
import { usePlannerData } from "../../hooks/usePlannerData";
import { useRecurringExpansion } from "../../hooks/useRecurringExpansion";
import { useWeekLayout } from "../../hooks/useWeekLayout";

const snap = (m: number) => Math.round(m / 15) * 15;

function TaskCard({ task, onToggle }: { task: PlannerTask; onToggle: () => void }) {
  return <div className="rounded border border-slate-700 bg-slate-900 p-2 text-xs">
    <div className="flex items-center justify-between"><b>{task.title}</b><input type="checkbox" checked={task.completed} onChange={onToggle} /></div>
    <div>{task.startMin != null && task.endMin != null ? `${String(Math.floor(task.startMin/60)).padStart(2,"0")}:${String(task.startMin%60).padStart(2,"0")} - ${String(Math.floor(task.endMin/60)).padStart(2,"0")}:${String(task.endMin%60).padStart(2,"0")}` : "Unscheduled"}</div>
  </div>;
}

export default function PlannerPanel({ client }: { client: DataClient | null }) {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [mode, setMode] = useState<"day" | "week">("day");
  const [subTab, setSubTab] = useState<"planner" | "recurring" | "templates">("planner");
  const { day, setDay, recurring, setRecurring, templates, setTemplates, reload } = usePlannerData(client, date);
  const expandedTasks = useRecurringExpansion(date, day, recurring);

  const saveDay = async (next: PlannerDay) => {
    setDay(next);
    await client?.savePlannerDay(date, next);
  };

  const addTask = async () => {
    const title = window.prompt("Task title");
    if (!title) return;
    const start = Number(window.prompt("Start minute (0-1439)", "540"));
    const end = Number(window.prompt("End minute (1-1440)", "600"));
    const task: PlannerTask = {
      id: `task_${crypto.randomUUID()}`,
      title,
      priority: "med",
      note: null,
      completed: false,
      startMin: Number.isFinite(start) ? snap(start) : null,
      endMin: Number.isFinite(end) ? snap(end) : null
    };
    await saveDay({ ...day, tasks: [...day.tasks, task] });
  };

  const tasksByDate = useMemo(() => ({ [date]: expandedTasks }), [date, expandedTasks]);
  const weekColumns = useWeekLayout(date, tasksByDate);

  const applyTemplate = async () => {
    const id = window.prompt("Template id to apply");
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const next = tpl.blocks.map((b) => ({ id: `task_${crypto.randomUUID()}`, title: b.title, priority: b.priority, note: null, completed: false, startMin: b.startMin, endMin: b.endMin } as PlannerTask));
    await saveDay({ ...day, tasks: [...day.tasks, ...next] });
  };

  const createTemplateFromDay = async () => {
    const name = window.prompt("Template name");
    if (!name) return;
    const created = { id: `tpl_${crypto.randomUUID()}`, name, createdAt: new Date().toISOString(), blocks: expandedTasks.filter((t) => t.startMin != null && t.endMin != null).map((t) => ({ title: t.title, startMin: t.startMin!, endMin: t.endMin!, priority: t.priority })) };
    const next = [...templates, created];
    setTemplates(next);
    await client?.saveTemplates(next);
  };

  return <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-4">
    <div className="flex items-center gap-2">
      <button className={`rounded px-3 py-1 ${mode === "day" ? "bg-sky-600" : "bg-slate-700"}`} onClick={() => setMode("day")}>Day</button>
      <button className={`rounded px-3 py-1 ${mode === "week" ? "bg-sky-600" : "bg-slate-700"}`} onClick={() => setMode("week")}>Week</button>
      <input className="rounded bg-slate-900 px-2 py-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <button className="rounded bg-slate-700 px-3 py-1" onClick={addTask}>Add Block</button>
      <button className="rounded bg-slate-700 px-3 py-1" onClick={applyTemplate}>Apply Template</button>
      <button className="rounded bg-slate-700 px-3 py-1" onClick={createTemplateFromDay}>Create Template from Day</button>
      <button className="rounded bg-slate-700 px-3 py-1" onClick={() => void reload()}>Refresh</button>
    </div>

    <div className="flex gap-2">
      <button className={`rounded px-2 py-1 ${subTab === "planner" ? "bg-sky-600" : "bg-slate-700"}`} onClick={() => setSubTab("planner")}>Planner</button>
      <button className={`rounded px-2 py-1 ${subTab === "recurring" ? "bg-sky-600" : "bg-slate-700"}`} onClick={() => setSubTab("recurring")}>Recurring</button>
      <button className={`rounded px-2 py-1 ${subTab === "templates" ? "bg-sky-600" : "bg-slate-700"}`} onClick={() => setSubTab("templates")}>Templates</button>
    </div>

    {subTab === "planner" && mode === "day" && <div className="grid gap-2 md:grid-cols-2">
      {expandedTasks.map((task) => <TaskCard key={task.id} task={task} onToggle={() => void saveDay({ ...day, tasks: day.tasks.map((t) => t.id === task.id ? { ...t, completed: !t.completed } : t) })} />)}
    </div>}

    {subTab === "planner" && mode === "week" && <div className="grid grid-cols-7 gap-2 overflow-auto max-h-[480px]">
      {weekColumns.map((col) => <div key={col.date} className={`rounded border p-2 ${col.date === format(new Date(), "yyyy-MM-dd") ? "border-sky-400" : "border-slate-700"}`}>
        <div className="mb-2 text-center text-xs font-semibold">{col.label}</div>
        <div className="space-y-1">{col.tasks.map((task) => <TaskCard key={task.id} task={task} onToggle={() => void saveDay({ ...day, tasks: day.tasks.map((t) => t.id === task.id ? { ...t, completed: !t.completed } : t) })} />)}</div>
      </div>)}
    </div>}

    {subTab === "recurring" && <RecurringManager client={client} recurring={recurring} setRecurring={setRecurring} />}
    {subTab === "templates" && <TemplateManager client={client} templates={templates} setTemplates={setTemplates} />}
  </section>;
}

function RecurringManager({ client, recurring, setRecurring }: { client: DataClient | null; recurring: any[]; setRecurring: (next: any[]) => void }) {
  const add = async () => {
    const title = window.prompt("Recurring title");
    if (!title) return;
    const next = [...recurring, { id: `rec_${crypto.randomUUID()}`, title, priority: "med", note: null, recurrence: { type: "daily", interval: 1 }, defaultSchedule: null, createdAt: new Date().toISOString(), archived: false }];
    setRecurring(next);
    await client?.saveRecurring(next);
  };
  return <div className="space-y-2">
    <button className="rounded bg-slate-700 px-3 py-1" onClick={add}>Add recurring</button>
    {recurring.map((r) => <div key={r.id} className="rounded border border-slate-700 p-2 text-xs flex justify-between"><span>{r.title} ({r.recurrence.type})</span><button onClick={async ()=>{const next=recurring.map((x)=>x.id===r.id?{...x,archived:!x.archived}:x);setRecurring(next);await client?.saveRecurring(next);}}>{r.archived?"Unarchive":"Archive"}</button></div>)}
  </div>;
}

function TemplateManager({ client, templates, setTemplates }: { client: DataClient | null; templates: any[]; setTemplates: (next: any[]) => void }) {
  const del = async (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next);
    await client?.saveTemplates(next);
  };
  return <div className="space-y-2">{templates.map((t) => <div key={t.id} className="rounded border border-slate-700 p-2 text-xs flex justify-between"><span>{t.name} ({t.blocks.length} blocks)</span><button onClick={() => void del(t.id)}>Delete</button></div>)}</div>;
}
