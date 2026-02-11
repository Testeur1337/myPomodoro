import { useState } from "react";
import { Settings, Topic } from "../types";

interface SetupWizardProps {
  initialSettings: Settings;
  onComplete: (settings: Settings, topics: Topic[]) => void;
}

export default function SetupWizard({ initialSettings, onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState(initialSettings);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicName, setTopicName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6">
      <div className="w-full max-w-3xl rounded-3xl bg-slate-900 p-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Welcome to MyPomodoro</h2>
          <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Step {step} / 2</span>
        </div>

        {step === 1 && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              Focus minutes
              <input
                type="number"
                min={1}
                className="rounded-xl bg-slate-950 px-3 py-2"
                value={settings.focusMinutes}
                onChange={(event) => setSettings({ ...settings, focusMinutes: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Short break minutes
              <input
                type="number"
                min={1}
                className="rounded-xl bg-slate-950 px-3 py-2"
                value={settings.shortBreakMinutes}
                onChange={(event) => setSettings({ ...settings, shortBreakMinutes: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Long break minutes
              <input
                type="number"
                min={1}
                className="rounded-xl bg-slate-950 px-3 py-2"
                value={settings.longBreakMinutes}
                onChange={(event) => setSettings({ ...settings, longBreakMinutes: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Long break interval
              <input
                type="number"
                min={1}
                className="rounded-xl bg-slate-950 px-3 py-2"
                value={settings.longBreakInterval}
                onChange={(event) => setSettings({ ...settings, longBreakInterval: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Daily goal (minutes)
              <input
                type="number"
                min={1}
                className="rounded-xl bg-slate-950 px-3 py-2"
                value={settings.dailyGoalMinutes}
                onChange={(event) => setSettings({ ...settings, dailyGoalMinutes: Number(event.target.value) })}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6">
            <p className="text-sm text-slate-300">Add your first topics (you can add more later).</p>
            <div className="mt-4 flex gap-3">
              <input
                className="flex-1 rounded-xl bg-slate-950 px-3 py-2 text-sm"
                placeholder="Topic name"
                value={topicName}
                onChange={(event) => setTopicName(event.target.value)}
              />
              <button
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
                onClick={() => {
                  if (!topicName.trim()) {
                    return;
                  }
                  setTopics((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      name: topicName.trim(),
                      color: "#38bdf8",
                      createdAt: new Date().toISOString(),
                      projectId: null,
                      archived: false
                    }
                  ]);
                  setTopicName("");
                }}
              >
                Add
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {topics.map((topic) => (
                <div key={topic.id} className="rounded-xl bg-slate-950 px-3 py-2 text-sm">
                  {topic.name}
                </div>
              ))}
              {topics.length === 0 && (
                <p className="text-xs text-slate-400">No topics yet. Add at least one.</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <button
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm"
            onClick={() => setStep((prev) => Math.max(1, prev - 1))}
            disabled={step === 1}
          >
            Back
          </button>
          {step === 1 ? (
            <button
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
              onClick={() => setStep(2)}
            >
              Next
            </button>
          ) : (
            <button
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
              onClick={() => onComplete(settings, topics)}
              disabled={topics.length === 0}
            >
              Finish setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
