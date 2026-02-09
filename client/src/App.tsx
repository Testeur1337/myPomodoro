import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDataClient, DataClient } from "./utils/dataClient";
import { SessionRecord, Settings, TimerPhase, TimerState, Topic } from "./types";
import TimerPanel from "./components/TimerPanel";
import TopicsPanel from "./components/TopicsPanel";
import StatsDashboard from "./components/StatsDashboard";
import SettingsPanel from "./components/SettingsPanel";
import SetupWizard from "./components/SetupWizard";
import { formatMinutes } from "./utils/time";

const TIMER_KEY = "mypomodoro.timerState";
const SETUP_KEY = "mypomodoro.setupComplete";

const defaultSettings: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  trackBreaks: true,
  dailyGoalMinutes: 120,
  streakGoalMinutes: 60,
  useLocalStorageFallback: false
};

function getPhaseDuration(settings: Settings, phase: TimerPhase) {
  if (phase === "focus") return settings.focusMinutes * 60;
  if (phase === "shortBreak") return settings.shortBreakMinutes * 60;
  return settings.longBreakMinutes * 60;
}

function createInitialTimerState(settings: Settings, currentTopicId: string | null): TimerState {
  return {
    phase: "focus",
    remainingSeconds: getPhaseDuration(settings, "focus"),
    isRunning: false,
    startedAt: null,
    phaseStartedAt: null,
    currentTopicId,
    completedFocusSessions: 0
  };
}

function loadStoredTimer(settings: Settings, currentTopicId: string | null) {
  const stored = localStorage.getItem(TIMER_KEY);
  if (!stored) {
    return createInitialTimerState(settings, currentTopicId);
  }
  try {
    const parsed = JSON.parse(stored) as TimerState;
    return { ...createInitialTimerState(settings, currentTopicId), ...parsed };
  } catch (error) {
    return createInitialTimerState(settings, currentTopicId);
  }
}

function saveTimerState(state: TimerState) {
  localStorage.setItem(TIMER_KEY, JSON.stringify(state));
}

async function reconcileElapsed(
  state: TimerState,
  settings: Settings,
  client: DataClient | null,
  currentTopic: Topic | null,
  appendSession: (session: SessionRecord) => void
) {
  if (!state.isRunning || !state.startedAt) {
    return state;
  }
  const now = Date.now();
  let elapsed = Math.floor((now - new Date(state.startedAt).getTime()) / 1000);
  if (elapsed <= 0) {
    return state;
  }
  let nextState = { ...state };
  while (elapsed >= nextState.remainingSeconds) {
    const durationSeconds = getPhaseDuration(settings, nextState.phase);
    const phaseEndTime = new Date(now - (elapsed - nextState.remainingSeconds) * 1000);
    const phaseStartTime = new Date(phaseEndTime.getTime() - durationSeconds * 1000).toISOString();
    const phaseEndIso = phaseEndTime.toISOString();
    if (client) {
      if (nextState.phase === "focus") {
        const newSession = await client.createSession({
          type: "focus",
          topicId: nextState.currentTopicId,
          topicName: currentTopic?.name ?? null,
          note: null,
          startTime: phaseStartTime,
          endTime: phaseEndIso,
          durationSeconds
        });
        appendSession(newSession);
      } else if (settings.trackBreaks) {
        const newSession = await client.createSession({
          type: "break",
          topicId: nextState.currentTopicId,
          topicName: currentTopic?.name ?? null,
          note: null,
          startTime: phaseStartTime,
          endTime: phaseEndIso,
          durationSeconds
        });
        appendSession(newSession);
      }
    }
    elapsed -= nextState.remainingSeconds;
    const nextFocusCount =
      nextState.phase === "focus"
        ? nextState.completedFocusSessions + 1
        : nextState.completedFocusSessions;
    const nextPhase: TimerPhase =
      nextState.phase === "focus"
        ? nextFocusCount % settings.longBreakInterval === 0
          ? "longBreak"
          : "shortBreak"
        : "focus";
    nextState = {
      ...nextState,
      phase: nextPhase,
      remainingSeconds: getPhaseDuration(settings, nextPhase),
      completedFocusSessions: nextFocusCount,
      phaseStartedAt: null
    };
  }
  const remainingSeconds = Math.max(1, nextState.remainingSeconds - elapsed);
  const phaseDuration = getPhaseDuration(settings, nextState.phase);
  const phaseStartedAt = new Date(now - (phaseDuration - remainingSeconds) * 1000).toISOString();
  return {
    ...nextState,
    remainingSeconds,
    startedAt: new Date().toISOString(),
    phaseStartedAt
  };
}

function playChime() {
  try {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1);
    oscillator.stop(audioContext.currentTime + 1);
  } catch (error) {
    // ignore
  }
}

function notify(title: string, body: string) {
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(title, { body });
        }
      });
    }
  }
  playChime();
}

export default function App() {
  const [client, setClient] = useState<DataClient | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [timerState, setTimerState] = useState<TimerState>(createInitialTimerState(settings, null));
  const [activeTab, setActiveTab] = useState("timer");
  const [showWizard, setShowWizard] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const currentTopic = useMemo(
    () => topics.find((topic) => topic.id === timerState.currentTopicId) ?? null,
    [topics, timerState.currentTopicId]
  );

  const syncTimerState = useCallback((state: TimerState) => {
    setTimerState(state);
    saveTimerState(state);
  }, []);

  const loadData = useCallback(
    async (selectedClient: DataClient) => {
      const [loadedSettings, loadedTopics, loadedSessions] = await Promise.all([
        selectedClient.getSettings(),
        selectedClient.getTopics(),
        selectedClient.getSessions()
      ]);
      setSettings(loadedSettings);
      setTopics(loadedTopics);
      setSessions(loadedSessions);
      const initialTopicId = loadedTopics[0]?.id ?? null;
      const storedTimer = loadStoredTimer(loadedSettings, initialTopicId);
      const reconciled = await reconcileElapsed(
        storedTimer,
        loadedSettings,
        selectedClient,
        loadedTopics.find((topic) => topic.id === storedTimer.currentTopicId) ?? null,
        (session) => setSessions((prev) => [...prev, session])
      );
      syncTimerState(reconciled);
      setShowWizard(!localStorage.getItem(SETUP_KEY));
    },
    [syncTimerState]
  );

  useEffect(() => {
    createDataClient(false).then((selectedClient) => {
      setClient(selectedClient);
      loadData(selectedClient);
    });
  }, [loadData]);

  useEffect(() => {
    if (!timerState.isRunning || !timerState.startedAt) {
      return;
    }

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }

    intervalRef.current = window.setInterval(() => {
      setTimerState((prev) => {
        if (!prev.isRunning || !prev.startedAt) {
          return prev;
        }
        const now = Date.now();
        const elapsed = Math.floor((now - new Date(prev.startedAt).getTime()) / 1000);
        if (elapsed <= 0) {
          return prev;
        }
        const remaining = prev.remainingSeconds - elapsed;
        if (remaining <= 0) {
          const updated = {
            ...prev,
            remainingSeconds: 0,
            isRunning: false,
            startedAt: null
          };
          saveTimerState(updated);
          window.setTimeout(() => handlePhaseCompletion(true, updated), 0);
          return updated;
        }
        const updated = { ...prev, remainingSeconds: remaining, startedAt: new Date().toISOString() };
        saveTimerState(updated);
        return updated;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [handlePhaseCompletion, timerState.isRunning, timerState.startedAt]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        handleStartPause();
      }
      if (event.key.toLowerCase() === "n") {
        handleSkip();
      }
      if (event.key.toLowerCase() === "r") {
        handleReset();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const handlePhaseCompletion = useCallback(
    (recordSessions = true, stateOverride?: TimerState) => {
      const activeState = stateOverride ?? timerState;
      const now = new Date();
      const phaseStart =
        activeState.phaseStartedAt ?? new Date(now.getTime() - activeState.remainingSeconds * 1000).toISOString();
      const durationSeconds = getPhaseDuration(settings, activeState.phase);

      if (client && recordSessions) {
        if (activeState.phase === "focus") {
          client
            .createSession({
              type: "focus",
              topicId: activeState.currentTopicId,
              topicName: currentTopic?.name ?? null,
              note: null,
              startTime: phaseStart,
              endTime: now.toISOString(),
              durationSeconds
            })
            .then((newSession) => setSessions((prev) => [...prev, newSession]));
        }

        if (activeState.phase !== "focus" && settings.trackBreaks) {
          client
            .createSession({
              type: "break",
              topicId: activeState.currentTopicId,
              topicName: currentTopic?.name ?? null,
              note: null,
              startTime: phaseStart,
              endTime: now.toISOString(),
              durationSeconds
            })
            .then((newSession) => setSessions((prev) => [...prev, newSession]));
        }
      }

      const nextFocusCount =
        activeState.phase === "focus" ? activeState.completedFocusSessions + 1 : activeState.completedFocusSessions;
      const nextPhase: TimerPhase =
        activeState.phase === "focus"
          ? nextFocusCount % settings.longBreakInterval === 0
            ? "longBreak"
            : "shortBreak"
          : "focus";

    const shouldAutoStart =
      nextPhase === "focus" ? settings.autoStartFocus : settings.autoStartBreaks;

    if (recordSessions) {
      notify(
        nextPhase === "focus" ? "Break complete" : "Focus complete",
        nextPhase === "focus" ? "Time to focus again." : "Take a short break."
      );
    }

      const updated: TimerState = {
        phase: nextPhase,
        remainingSeconds: getPhaseDuration(settings, nextPhase),
        isRunning: shouldAutoStart,
        startedAt: shouldAutoStart ? new Date().toISOString() : null,
        phaseStartedAt: shouldAutoStart ? new Date().toISOString() : null,
        currentTopicId: activeState.currentTopicId,
        completedFocusSessions: nextFocusCount
      };

      syncTimerState(updated);
    },
    [client, currentTopic?.name, settings, syncTimerState, timerState]
  );

  const handleStartPause = useCallback(() => {
    syncTimerState({
      ...timerState,
      isRunning: !timerState.isRunning,
      startedAt: !timerState.isRunning ? new Date().toISOString() : null,
      phaseStartedAt: timerState.phaseStartedAt ?? new Date().toISOString()
    });
  }, [syncTimerState, timerState]);

  const handleSkip = useCallback(() => {
    syncTimerState({
      ...timerState,
      remainingSeconds: 0,
      isRunning: false,
      startedAt: null
    });
    handlePhaseCompletion(false);
  }, [handlePhaseCompletion, syncTimerState, timerState]);

  const handleReset = useCallback(() => {
    syncTimerState({
      ...timerState,
      remainingSeconds: getPhaseDuration(settings, timerState.phase),
      isRunning: false,
      startedAt: null,
      phaseStartedAt: null
    });
  }, [settings, syncTimerState, timerState]);

  const handleTopicChange = useCallback(
    (topicId: string) => {
      syncTimerState({ ...timerState, currentTopicId: topicId || null });
    },
    [syncTimerState, timerState]
  );

  const handleSaveSettings = async (updated: Settings) => {
    if (!client) return;
    const saved = await client.updateSettings(updated);
    setSettings(saved);
    if (updated.useLocalStorageFallback) {
      const localClient = await createDataClient(true);
      setClient(localClient);
      loadData(localClient);
    } else {
      const refreshedClient = await createDataClient(false);
      setClient(refreshedClient);
      loadData(refreshedClient);
    }
  };

  const handleCreateTopic = async (payload: Pick<Topic, "name" | "color">) => {
    if (!client) return;
    const created = await client.createTopic(payload);
    setTopics((prev) => [...prev, created]);
  };

  const handleUpdateTopic = async (id: string, payload: Pick<Topic, "name" | "color">) => {
    if (!client) return;
    const updated = await client.updateTopic(id, payload);
    setTopics((prev) => prev.map((topic) => (topic.id === id ? updated : topic)));
  };

  const handleDeleteTopic = async (id: string) => {
    if (!client) return;
    await client.deleteTopic(id);
    setTopics((prev) => prev.filter((topic) => topic.id !== id));
  };

  const handleUpdateSession = async (id: string, patch: Partial<Pick<SessionRecord, "topicId" | "topicName" | "note">>) => {
    if (!client) return;
    const updated = await client.updateSession(id, patch);
    setSessions((prev) => prev.map((session) => (session.id === id ? updated : session)));
  };

  const handleDeleteSession = async (id: string) => {
    if (!client) return;
    await client.deleteSession(id);
    setSessions((prev) => prev.filter((session) => session.id !== id));
  };

  const handleExport = async () => {
    if (!client) return;
    const payload = await client.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mypomodoro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    if (!client) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    const imported = await client.importAll(parsed);
    setSettings(imported.settings);
    setTopics(imported.topics);
    setSessions(imported.sessions);
  };

  const handleWizardComplete = async (wizardSettings: Settings, wizardTopics: Topic[]) => {
    if (!client) return;
    await client.updateSettings(wizardSettings);
    await Promise.all(wizardTopics.map((topic) => client.createTopic({ name: topic.name, color: topic.color })));
    localStorage.setItem(SETUP_KEY, "true");
    setShowWizard(false);
    loadData(client);
  };

  const sessionSummary = useMemo(() => {
    const focusMinutes = sessions
      .filter((session) => session.type === "focus")
      .reduce((sum, session) => sum + session.durationSeconds / 60, 0);
    return formatMinutes(Math.round(focusMinutes));
  }, [sessions]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">MyPomodoro</h1>
            <p className="text-sm text-slate-400">Focus total: {sessionSummary}</p>
          </div>
          <nav className="flex gap-2 rounded-full bg-slate-900/60 p-2">
            {[
              { id: "timer", label: "Timer" },
              { id: "stats", label: "Stats" },
              { id: "settings", label: "Settings" }
            ].map((tab) => (
              <button
                key={tab.id}
                className={`rounded-full px-4 py-2 text-sm ${
                  activeTab === tab.id ? "bg-slate-100 text-slate-950" : "text-slate-300"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="mt-8 flex flex-col gap-8">
          {activeTab === "timer" && (
            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
              <TimerPanel
                settings={settings}
                topics={topics}
                timerState={timerState}
                onStartPause={handleStartPause}
                onSkip={handleSkip}
                onReset={handleReset}
                onTopicChange={handleTopicChange}
                onToggleAutoBreaks={(value) => handleSaveSettings({ ...settings, autoStartBreaks: value })}
                onToggleAutoFocus={(value) => handleSaveSettings({ ...settings, autoStartFocus: value })}
              />
              <TopicsPanel
                topics={topics}
                onCreate={handleCreateTopic}
                onUpdate={handleUpdateTopic}
                onDelete={handleDeleteTopic}
              />
            </div>
          )}

          {activeTab === "stats" && (
            <StatsDashboard
              settings={settings}
              sessions={sessions}
              topics={topics}
              onUpdateSession={handleUpdateSession}
              onDeleteSession={handleDeleteSession}
            />
          )}

          {activeTab === "settings" && (
            <SettingsPanel
              settings={settings}
              mode={client?.mode ?? "server"}
              onSave={handleSaveSettings}
              onExport={handleExport}
              onImport={handleImport}
            />
          )}
        </main>
      </div>

      {showWizard && <SetupWizard initialSettings={settings} onComplete={handleWizardComplete} />}
    </div>
  );
}
