import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  X,
} from 'lucide-react';
import {
  getCppPlaybackSnapshot,
  loadCppPlayback,
  MetricDataPoint,
  PlaybackSnapshot,
  resetCppPlayback,
  tickCppPlayback,
} from '../wasmBridge';
import { MetricsPanel } from './MetricsPanel';
import { NodeClusterPanel } from './NodeClusterPanel';
import { TaskQueuePanel } from './TaskQueuePanel';

interface WorkloadPlaybackPanelProps {
  csvText: string;
  strategyId: string;
  workloadLabel: string;
  onClose: () => void;
}

const SPEED_OPTIONS = [1, 2, 5, 10];

export const WorkloadPlaybackPanel: React.FC<WorkloadPlaybackPanelProps> = ({
  csvText,
  strategyId,
  workloadLabel,
  onClose,
}) => {
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null);
  const [history, setHistory] = useState<MetricDataPoint[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(2);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize in C++ WebAssembly
  useEffect(() => {
    let active = true;
    const init = async () => {
      await loadCppPlayback(csvText, strategyId);
      const snap = await getCppPlaybackSnapshot();
      if (active) {
        setSnapshot(snap);
        setHistory([snap.latestMetrics]);
        setIsRunning(false);
      }
    };
    init();

    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [csvText, strategyId]);

  const stepTick = async () => {
    await tickCppPlayback();
    const snap = await getCppPlaybackSnapshot();
    setSnapshot(snap);
    setHistory((prev) => [...prev.slice(-49), snap.latestMetrics]);
    if (snap.isFinished) {
      setIsRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handlePlay = () => {
    if (snapshot?.isFinished) return;
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleReset = async () => {
    handlePause();
    await resetCppPlayback();
    const snap = await getCppPlaybackSnapshot();
    setSnapshot(snap);
    setHistory([snap.latestMetrics]);
  };

  // Run timer for playback
  useEffect(() => {
    if (isRunning) {
      const intervalMs = Math.max(50, Math.round(800 / speed));
      timerRef.current = setInterval(() => {
        stepTick();
      }, intervalMs);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, speed]);

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-xs text-gray-500">
        Initializing C++ WebAssembly Simulation Engine...
      </div>
    );
  }

  const progressPct =
    snapshot.totalTasks > 0
      ? Math.round((snapshot.completedCount / snapshot.totalTasks) * 100)
      : 0;

  return (
    <section className="space-y-4 rounded-xl border border-gray-300 bg-gray-50/70 p-5">
      {/* Playback Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Workload Simulation · Powered by C++ WebAssembly
            </span>
            {snapshot.isFinished ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                <CheckCircle2 className="h-3 w-3" />
                Completed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRunning ? 'animate-pulse bg-emerald-500' : 'bg-gray-400'
                  }`}
                />
                {isRunning ? 'Simulating' : 'Ready'}
              </span>
            )}
          </div>

          <h3 className="mt-0.5 text-base font-bold text-gray-900">
            {snapshot.strategyName}{' '}
            <span className="text-xs font-normal text-gray-500">
              on {workloadLabel}
            </span>
          </h3>

          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <span className="font-mono">
              Tick <strong className="text-gray-900">{snapshot.currentTick}</strong>
            </span>
            <span>·</span>
            <span className="font-mono">
              <strong className="text-gray-900">
                {snapshot.completedCount.toLocaleString()}
              </strong>
              /{snapshot.totalTasks.toLocaleString()} tasks done ({progressPct}%)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Speed Pills */}
          <div className="flex items-center rounded-lg bg-gray-100 p-0.5">
            {SPEED_OPTIONS.map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setSpeed(spd)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                  speed === spd
                    ? 'bg-white text-gray-900 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {isRunning ? (
            <button
              type="button"
              onClick={handlePause}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800"
            >
              <Pause className="h-3.5 w-3.5 fill-current" />
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlay}
              disabled={snapshot.isFinished}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Play
            </button>
          )}

          <button
            type="button"
            onClick={stepTick}
            disabled={isRunning || snapshot.isFinished}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <StepForward className="h-3.5 w-3.5" />
            Step
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close simulation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Live Metrics */}
      <MetricsPanel
        latest={snapshot.latestMetrics}
        history={history}
      />

      {/* Live Queue & Compute Nodes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <TaskQueuePanel
            tasks={snapshot.queuedTasks}
            lastAssignedCount={snapshot.lastAssignedCount}
          />
        </div>
        <div className="lg:col-span-8">
          <NodeClusterPanel
            nodes={snapshot.nodes}
            strategyName={snapshot.strategyName}
          />
        </div>
      </div>
    </section>
  );
};
