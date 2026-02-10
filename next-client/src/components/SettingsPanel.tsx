import { useState } from "react";
import { Settings } from "../types";

interface SettingsPanelProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  mode: "server" | "local";
}

export default function SettingsPanel({ settings, onSave, onExport, onImport, mode }: SettingsPanelProps) {
  const [draft, setDraft] = useState(settings);

  return (
    <section className="rounded-3xl bg-slate-900/60 p-6">
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-lg font-semibold">Settings</h3>
          <p className="text-sm text-slate-400">Mode: {mode === "server" ? "Local server" : "Static (localStorage)"}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            Focus minutes
            <input
              type="number"
              min={1}
              className="rounded-xl bg-slate-950 px-3 py-2"
              value={draft.focusMinutes}
              onChange={(event) => setDraft({ ...draft, focusMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Short break minutes
            <input
              type="number"
              min={1}
              className="rounded-xl bg-slate-950 px-3 py-2"
              value={draft.shortBreakMinutes}
              onChange={(event) => setDraft({ ...draft, shortBreakMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Long break minutes
            <input
              type="number"
              min={1}
              className="rounded-xl bg-slate-950 px-3 py-2"
              value={draft.longBreakMinutes}
              onChange={(event) => setDraft({ ...draft, longBreakMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Long break interval
            <input
              type="number"
              min={1}
              className="rounded-xl bg-slate-950 px-3 py-2"
              value={draft.longBreakInterval}
              onChange={(event) => setDraft({ ...draft, longBreakInterval: Number(event.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Daily goal (minutes)
            <input
              type="number"
              min={1}
              className="rounded-xl bg-slate-950 px-3 py-2"
              value={draft.dailyGoalMinutes}
              onChange={(event) => setDraft({ ...draft, dailyGoalMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Streak goal (minutes)
            <input
              type="number"
              min={1}
              className="rounded-xl bg-slate-950 px-3 py-2"
              value={draft.streakGoalMinutes}
              onChange={(event) => setDraft({ ...draft, streakGoalMinutes: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-sm">
            Track breaks
            <input
              type="checkbox"
              checked={draft.trackBreaks}
              onChange={(event) => setDraft({ ...draft, trackBreaks: event.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-sm">
            Auto-start breaks
            <input
              type="checkbox"
              checked={draft.autoStartBreaks}
              onChange={(event) => setDraft({ ...draft, autoStartBreaks: event.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-sm">
            Auto-start focus
            <input
              type="checkbox"
              checked={draft.autoStartFocus}
              onChange={(event) => setDraft({ ...draft, autoStartFocus: event.target.checked })}
            />
          </label>
        </div>

        <label className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-sm">
          Use localStorage fallback (static mode)
          <input
            type="checkbox"
            checked={draft.useLocalStorageFallback}
            onChange={(event) => setDraft({ ...draft, useLocalStorageFallback: event.target.checked })}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
            onClick={() => onSave(draft)}
          >
            Save settings
          </button>
          <button
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold"
            onClick={() => {
              setDraft(settings);
            }}
          >
            Reset changes
          </button>
        </div>

        <div className="rounded-2xl bg-slate-950 px-4 py-3 text-sm text-slate-300">
          <p className="font-semibold">Backup & import</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button className="rounded-xl bg-slate-800 px-3 py-2 text-xs" onClick={onExport}>
              Download backup JSON
            </button>
            <label className="rounded-xl bg-slate-800 px-3 py-2 text-xs cursor-pointer">
              Import JSON
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files?.[0]) {
                    onImport(event.target.files[0]);
                    event.target.value = "";
                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
