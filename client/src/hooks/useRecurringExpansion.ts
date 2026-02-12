import { useMemo } from "react";
import { PlannerDay, PlannerTask, RecurringTask } from "../types";

const dayMs = 24 * 60 * 60 * 1000;

function matches(recurring: RecurringTask, date: string) {
  const day = new Date(`${date}T00:00:00.000Z`);
  const created = new Date(recurring.createdAt);
  const diffDays = Math.floor((day.getTime() - created.getTime()) / dayMs);
  if (diffDays < 0) return false;
  if (recurring.recurrence.type === "daily") return diffDays % recurring.recurrence.interval === 0;
  const weekday = ((day.getUTCDay() + 6) % 7) + 1;
  if (!(recurring.recurrence.weekdays ?? []).includes(weekday)) return false;
  return Math.floor(diffDays / 7) % recurring.recurrence.interval === 0;
}

export function useRecurringExpansion(date: string, day: PlannerDay, recurring: RecurringTask[]) {
  return useMemo(() => {
    const existing = new Set(day.tasks.filter((t) => t.sourceRecurringId).map((t) => t.sourceRecurringId));
    const hidden = new Set(day.tasks.filter((t) => t.deleted && t.sourceRecurringId).map((t) => t.sourceRecurringId));
    const virtual: PlannerTask[] = recurring
      .filter((r) => !r.archived && matches(r, date) && !existing.has(r.id) && !hidden.has(r.id))
      .map((r) => ({
        id: `vrt_${r.id}_${date}`,
        title: r.title,
        priority: r.priority,
        note: r.note,
        completed: false,
        startMin: r.defaultSchedule?.startMin ?? null,
        endMin: r.defaultSchedule?.endMin ?? null,
        sourceRecurringId: r.id
      }));

    return [...day.tasks.filter((t) => !t.deleted), ...virtual];
  }, [date, day.tasks, recurring]);
}
