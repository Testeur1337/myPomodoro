import classNames from "classnames";
import { Settings, TimerState, Topic } from "../types";
import { formatDuration } from "../utils/time";

interface TimerPanelProps {
  settings: Settings;
  topics: Topic[];
  timerState: TimerState;
  onStartPause: () => void;
  onSkip: () => void;
  onReset: () => void;
  onTopicChange: (topicId: string) => void;
  onToggleAutoBreaks: (value: boolean) => void;
  onToggleAutoFocus: (value: boolean) => void;
}

const phaseLabels: Record<TimerState["phase"], string> = {
  focus: "Focus",
  shortBreak: "Short Break",
  longBreak: "Long Break"
};

const phaseColors: Record<TimerState["phase"], string> = {
  focus: "from-emerald-500 to-emerald-300",
  shortBreak: "from-sky-500 to-sky-300",
  longBreak: "from-purple-500 to-purple-300"
};

export default function TimerPanel({
  settings,
  topics,
  timerState,
  onStartPause,
  onSkip,
  onReset,
  onTopicChange,
  onToggleAutoBreaks,
  onToggleAutoFocus
}: TimerPanelProps) {
  const focusNeedsTopic = timerState.phase === "focus" && !timerState.currentTopicId;
  return (
    <section className="rounded-3xl bg-slate-900/60 p-8 shadow-xl shadow-slate-950/40">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Phase</p>
            <h2 className="text-2xl font-semibold">{phaseLabels[timerState.phase]}</h2>
          </div>
          <div
            className={classNames(
              "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]",
              "bg-gradient-to-r text-slate-950",
              phaseColors[timerState.phase]
            )}
          >
            {timerState.isRunning ? "Running" : "Paused"}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="text-7xl font-bold tracking-tight">
            {formatDuration(timerState.remainingSeconds)}
          </div>
          <p className="text-sm text-slate-400">Completed focus sessions: {timerState.completedFocusSessions}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <button
            className={classNames(
              "rounded-xl px-4 py-3 text-sm font-semibold transition",
              focusNeedsTopic
                ? "bg-slate-700 text-slate-400"
                : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
            )}
            onClick={onStartPause}
            disabled={focusNeedsTopic}
          >
            {timerState.isRunning ? "Pause" : "Start"}
          </button>
          <button
            className="rounded-xl px-4 py-3 text-sm font-semibold bg-slate-800 text-slate-100 hover:bg-slate-700"
            onClick={onSkip}
          >
            Skip
          </button>
          <button
            className="rounded-xl px-4 py-3 text-sm font-semibold bg-slate-800 text-slate-100 hover:bg-slate-700"
            onClick={onReset}
          >
            Reset
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.25em] text-slate-400">Topic</label>
            <select
              className="mt-2 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm"
              value={timerState.currentTopicId ?? ""}
              onChange={(event) => onTopicChange(event.target.value)}
              disabled={timerState.phase !== "focus"}
            >
              <option value="">Select topic</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
            {focusNeedsTopic && (
              <p className="mt-2 text-xs text-amber-300">Pick a topic before starting a focus session.</p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-sm">
              Auto-start breaks
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings.autoStartBreaks}
                onChange={(event) => onToggleAutoBreaks(event.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3 text-sm">
              Auto-start focus
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings.autoStartFocus}
                onChange={(event) => onToggleAutoFocus(event.target.checked)}
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-950 px-4 py-3 text-xs text-slate-400">
          <div>Shortcuts: Space = start/pause, N = next, R = reset.</div>
        </div>
      </div>
    </section>
  );
}
