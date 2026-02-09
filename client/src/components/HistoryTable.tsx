import { format } from "date-fns";
import { SessionRecord, Topic } from "../types";

interface HistoryTableProps {
  sessions: SessionRecord[];
  topics: Topic[];
  onUpdate: (id: string, patch: Partial<Pick<SessionRecord, "topicId" | "topicName" | "note">>) => void;
  onDelete: (id: string) => void;
}

export default function HistoryTable({ sessions, topics, onUpdate, onDelete }: HistoryTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr>
            <th className="py-2">Date</th>
            <th className="py-2">Start</th>
            <th className="py-2">End</th>
            <th className="py-2">Duration</th>
            <th className="py-2">Topic</th>
            <th className="py-2">Type</th>
            <th className="py-2">Note</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {sessions.map((session) => (
            <tr key={session.id} className="text-slate-200">
              <td className="py-2">{format(new Date(session.startTime), "MMM d")}</td>
              <td className="py-2">{format(new Date(session.startTime), "HH:mm")}</td>
              <td className="py-2">{format(new Date(session.endTime), "HH:mm")}</td>
              <td className="py-2">{Math.round(session.durationSeconds / 60)}m</td>
              <td className="py-2">
                <select
                  className="rounded bg-slate-950 px-2 py-1 text-xs"
                  value={session.topicId ?? ""}
                  onChange={(event) => {
                    const topic = topics.find((item) => item.id === event.target.value);
                    onUpdate(session.id, {
                      topicId: event.target.value || null,
                      topicName: topic?.name ?? null
                    });
                  }}
                >
                  <option value="">None</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2 capitalize">{session.type}</td>
              <td className="py-2">
                <input
                  className="rounded bg-slate-950 px-2 py-1 text-xs"
                  value={session.note ?? ""}
                  onChange={(event) =>
                    onUpdate(session.id, {
                      note: event.target.value
                    })
                  }
                />
              </td>
              <td className="py-2 text-right">
                <button
                  className="text-xs text-rose-300 hover:text-rose-200"
                  onClick={() => {
                    if (window.confirm("Delete this session?")) {
                      onDelete(session.id);
                    }
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sessions.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">No sessions match your filters.</p>
      )}
    </div>
  );
}
