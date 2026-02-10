import { format, isSameDay, startOfDay, subDays } from "date-fns";
import { SessionRecord } from "../types";

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder}m`;
  }
  return `${hours}h ${remainder}m`;
}

export function dateLabel(date: Date) {
  return format(date, "MMM d");
}

export function sumFocusMinutes(sessions: SessionRecord[]) {
  return Math.round(
    sessions
      .filter((session) => session.type === "focus")
      .reduce((total, session) => total + session.durationSeconds / 60, 0)
  );
}

export function focusMinutesByDay(sessions: SessionRecord[], days: number) {
  return Array.from({ length: days }).map((_, index) => {
    const date = startOfDay(subDays(new Date(), days - 1 - index));
    const total = sessions
      .filter((session) => session.type === "focus")
      .filter((session) => isSameDay(new Date(session.startTime), date))
      .reduce((sum, session) => sum + session.durationSeconds / 60, 0);
    return {
      date,
      minutes: Math.round(total)
    };
  });
}

export function sessionsToday(sessions: SessionRecord[]) {
  return sessions.filter((session) => isSameDay(new Date(session.startTime), new Date()));
}
