"use client";

import { useEffect, useState } from "react";

const PRESETS = [
  { label: "Pomodoro 25/5", focusMinutes: 25, breakMinutes: 5 },
  { label: "Deep Focus 50/10", focusMinutes: 50, breakMinutes: 10 },
];

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function StudyRoomTimer() {
  const [preset, setPreset] = useState(PRESETS[0]);
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [secondsRemaining, setSecondsRemaining] = useState(PRESETS[0].focusMinutes * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) {
      return;
    }

    const timerId = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timerId);
          const nextMode = mode === "focus" ? "break" : "focus";
          setMode(nextMode);
          setRunning(false);
          return (nextMode === "focus" ? preset.focusMinutes : preset.breakMinutes) * 60;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [mode, preset, running]);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow">
      <h2 className="text-xl font-semibold text-gray-900">Timer-Based Study Room</h2>
      <p className="mt-2 text-sm text-gray-600">Use a shared focus timer during virtual sessions.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        {PRESETS.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              setPreset(item);
              setMode("focus");
              setRunning(false);
              setSecondsRemaining(item.focusMinutes * 60);
            }}
            className={`rounded-full px-4 py-2 text-sm ${
              preset.label === item.label ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-gray-950 p-8 text-center text-white">
        <p className="text-xs uppercase tracking-[0.3em] text-gray-400">{mode === "focus" ? "Focus" : "Break"}</p>
        <p className="mt-4 text-6xl font-semibold">{formatTime(secondsRemaining)}</p>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => setRunning((current) => !current)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          onClick={() => {
            setRunning(false);
            setSecondsRemaining((mode === "focus" ? preset.focusMinutes : preset.breakMinutes) * 60);
          }}
          className="rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50"
        >
          Reset
        </button>
      </div>
    </section>
  );
}