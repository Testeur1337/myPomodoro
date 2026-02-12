import { useMemo } from "react";
import { format, startOfWeek, addDays } from "date-fns";
import { PlannerTask } from "../types";

export function useWeekLayout(anchorDate: string, tasksByDate: Record<string, PlannerTask[]>) {
  return useMemo(() => {
    const start = startOfWeek(new Date(`${anchorDate}T00:00:00`), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => {
      const date = format(addDays(start, i), "yyyy-MM-dd");
      return { date, label: format(addDays(start, i), "EEE"), tasks: tasksByDate[date] ?? [] };
    });
  }, [anchorDate, tasksByDate]);
}
