import { useState } from "react";
import { Topic } from "../types";

interface TopicsPanelProps {
  topics: Topic[];
  onCreate: (payload: Pick<Topic, "name" | "color">) => void;
  onUpdate: (id: string, payload: Pick<Topic, "name" | "color">) => void;
  onDelete: (id: string) => void;
}

export default function TopicsPanel({ topics, onCreate, onUpdate, onDelete }: TopicsPanelProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#38bdf8");

  return (
    <section className="rounded-3xl bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold">Topics</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <input
          className="rounded-xl bg-slate-950 px-3 py-2 text-sm"
          placeholder="Topic name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          type="color"
          className="h-10 rounded-xl bg-slate-950 px-2"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
        <button
          className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950"
          onClick={() => {
            if (!name.trim()) {
              return;
            }
            onCreate({ name: name.trim(), color });
            setName("");
          }}
        >
          Add topic
        </button>
      </div>

      <div className="mt-6 grid gap-3">
        {topics.map((topic) => (
          <div key={topic.id} className="flex flex-col gap-3 rounded-2xl bg-slate-950 px-4 py-3 md:flex-row md:items-center">
            <input
              className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm"
              value={topic.name}
              onChange={(event) => onUpdate(topic.id, { name: event.target.value, color: topic.color })}
            />
            <input
              type="color"
              className="h-9 rounded-lg bg-slate-900 px-2"
              value={topic.color}
              onChange={(event) => onUpdate(topic.id, { name: topic.name, color: event.target.value })}
            />
            <button
              className="text-xs text-rose-300 hover:text-rose-200"
              onClick={() => {
                if (window.confirm("Delete this topic?")) {
                  onDelete(topic.id);
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
        {topics.length === 0 && <p className="text-sm text-slate-400">Add a topic to start tracking focus sessions.</p>}
      </div>
    </section>
  );
}
