import { formatMinutes } from "../utils/time";

interface GoalRingProps {
  progressMinutes: number;
  goalMinutes: number;
}

export default function GoalRing({ progressMinutes, goalMinutes }: GoalRingProps) {
  const percent = Math.min(100, Math.round((progressMinutes / goalMinutes) * 100));
  const angle = (percent / 100) * 360;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="h-28 w-28 rounded-full bg-slate-900 flex items-center justify-center"
        style={{
          background: `conic-gradient(#22c55e ${angle}deg, #1e293b 0deg)`
        }}
      >
        <div className="h-20 w-20 rounded-full bg-slate-950 flex items-center justify-center">
          <span className="text-lg font-semibold">{percent}%</span>
        </div>
      </div>
      <div className="text-xs text-slate-400">
        {formatMinutes(progressMinutes)} / {formatMinutes(goalMinutes)}
      </div>
    </div>
  );
}
