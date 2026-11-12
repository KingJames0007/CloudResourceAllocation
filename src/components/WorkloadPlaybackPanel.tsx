import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  X,
} from 'lucide-react';
import { SchedulingStrategyId } from '../domain/SchedulingStrategy';
import { TaskSpec } from '../engine/StrategyEvaluator';
import { WorkloadPlaybackEngine } from '../engine/WorkloadPlaybackEngine';
import { MetricsPanel } from './MetricsPanel';
import { NodeClusterPanel } from './NodeClusterPanel';
import { TaskQueuePanel } from './TaskQueuePanel';

interface WorkloadPlaybackPanelProps {
  tasks: TaskSpec[];
  strategyId: SchedulingStrategyId;
  workloadLabel: string;
  onClose: () => void;
}

const SPEED_OPTIONS = [1, 2, 5, 10];

export const WorkloadPlaybackPanel: React.FC<WorkloadPlaybackPanelProps> = ({
  tasks,
  strategyId,
  workloadLabel,
  onClose,
}) => {
  const engine = useMemo(
    () => new WorkloadPlaybackEngine(tasks, strategyId),
    // Recreate only once; updates handled via engine.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    engine.load(tasks, strategyId);
  }, [engine, tasks, strategyId]);

  useEffect(() => {
    return () => engine.destroy();
  }, [engine]);

  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);

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
              Workload Simulation
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
                    snapshot.isRunning
                      ? 'animate-pulse bg-emerald-500'
                      : 'bg-gray-400'
                  }`}
                />
                {snapshot.isRunning ? 'Simulating' : 'Ready'}
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
                onClick={() => engine.setSpeed(spd)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                  snapshot.speed === spd
                    ? 'bg-white text-gray-900 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {snapshot.isRunning ? (
            <button
              type="button"
              onClick={() => engine.pause()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800"
            >
              <Pause className="h-3.5 w-3.5 fill-current" />
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => engine.start()}
              disabled={snapshot.isFinished}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Play
            </button>
          )}

          <button
            type="button"
            onClick={() => engine.tick()}
            disabled={snapshot.isRunning || snapshot.isFinished}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <StepForward className="h-3.5 w-3.5" />
            Step
          </button>

          <button
            type="button"
            onClick={() => engine.reset()}
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
        history={snapshot.metricsHistory}
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
