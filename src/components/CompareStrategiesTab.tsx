import React, { useRef, useState } from 'react';
import {
  Award,
  Download,
  FileSpreadsheet,
  Play,
  Upload,
} from 'lucide-react';
import { SchedulingStrategyId } from '../domain/SchedulingStrategy';
import {
  generateSampleTasksCsv,
  parseTasksCsv,
} from '../engine/CsvTaskParser';
import {
  BenchmarkReport,
  OptimizationGoal,
  PRESET_WORKLOADS,
  StrategyEvaluator,
  TaskSpec,
} from '../engine/StrategyEvaluator';
import { WorkloadPlaybackPanel } from './WorkloadPlaybackPanel';

const GOALS: { id: OptimizationGoal; label: string; hint: string }[] = [
  { id: 'balanced', label: 'Balanced', hint: 'Cost + Wait + Priority + Speed' },
  { id: 'lowest-cost', label: 'Lowest Cost', hint: 'Minimize total $ spend' },
  { id: 'lowest-wait', label: 'Lowest Wait', hint: 'Minimize avg queue delay' },
  { id: 'priority-sla', label: 'Priority SLA', hint: 'Fastest high-priority tasks' },
];

export const CompareStrategiesTab: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playbackRef = useRef<HTMLDivElement | null>(null);

  const [tasks, setTasks] = useState<TaskSpec[]>(
    PRESET_WORKLOADS['mixed-cloud'].tasks
  );
  const [workloadLabel, setWorkloadLabel] = useState<string>(
    PRESET_WORKLOADS['mixed-cloud'].label
  );
  const [goal, setGoal] = useState<OptimizationGoal>('balanced');
  const [evalMs, setEvalMs] = useState<number>(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [simulatedStrategy, setSimulatedStrategy] =
    useState<SchedulingStrategyId | null>(null);
  const [report, setReport] = useState<BenchmarkReport>(() =>
    StrategyEvaluator.evaluate(PRESET_WORKLOADS['mixed-cloud'].tasks, 'balanced')
  );

  const runEvaluation = (
    nextTasks: TaskSpec[],
    nextGoal: OptimizationGoal,
    label: string,
    nextWarnings: string[] = []
  ) => {
    const t0 = performance.now();
    const nextReport = StrategyEvaluator.evaluate(nextTasks, nextGoal);
    setEvalMs(Math.round(performance.now() - t0));
    setTasks(nextTasks);
    setGoal(nextGoal);
    setWorkloadLabel(label);
    setWarnings(nextWarnings);
    setReport(nextReport);
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseTasksCsv(text);
    if (parsed.tasks.length > 0) {
      runEvaluation(
        parsed.tasks,
        goal,
        `${file.name} (${parsed.tasks.length.toLocaleString()} tasks)`,
        parsed.warnings
      );
    } else {
      setWarnings(
        parsed.warnings.length > 0
          ? parsed.warnings
          : ['No valid tasks found in CSV.']
      );
    }
    e.target.value = '';
  };

  const handleDownloadSample = () => {
    const csv = generateSampleTasksCsv(500);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cloud_tasks_500.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartSimulation = (strategyId: SchedulingStrategyId) => {
    setSimulatedStrategy(strategyId);
    setTimeout(() => {
      playbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div className="space-y-5">
      {/* Step 1 & Step 2 Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Step 1: Pick or Upload Workload */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Step 1 · Workload
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <FileSpreadsheet className="h-3.5 w-3.5 text-gray-400" />
              {workloadLabel}
            </span>
          </div>

          <h2 className="mt-1 text-sm font-semibold text-gray-900">
            Pick a Preset or Upload a CSV Task List
          </h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(PRESET_WORKLOADS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => runEvaluation(preset.tasks, goal, preset.label)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
              >
                {preset.label}
              </button>
            ))}

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload CSV
            </button>

            <button
              type="button"
              onClick={handleDownloadSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              Sample 500-Task CSV
            </button>
          </div>

          {warnings.length > 0 && (
            <p className="mt-3 text-xs text-red-600">
              Skipped {warnings.length} invalid row(s): {warnings[0]}
            </p>
          )}
        </section>

        {/* Step 2: Pick Optimization Goal */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Step 2 · Optimization Goal
            </span>
            {evalMs > 0 && (
              <span className="font-mono text-[11px] text-gray-400">
                Evaluated in {evalMs} ms
              </span>
            )}
          </div>

          <h2 className="mt-1 text-sm font-semibold text-gray-900">
            What Matters Most for This Workload?
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GOALS.map((g) => {
              const active = goal === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() =>
                    runEvaluation(tasks, g.id, workloadLabel, warnings)
                  }
                  className={`rounded-lg border p-2.5 text-left transition ${
                    active
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-xs font-semibold">{g.label}</div>
                  <div
                    className={`mt-0.5 text-[10px] ${
                      active ? 'text-gray-300' : 'text-gray-400'
                    }`}
                  >
                    {g.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Step 3: Clear Winner Card + Simple 4-Row Table */}
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Step 3 · Result &amp; Strategy Simulation
        </span>

        {/* Winner Card */}
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-teal-200 bg-teal-50/60 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
              <Award className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                  Superior Strategy
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-gray-900 ring-1 ring-teal-200">
                  Score {report.winner.compositeScore}/100
                </span>
              </div>
              <h3 className="mt-0.5 text-lg font-bold text-gray-900">
                {report.winner.strategyName}
              </h3>
              <p className="mt-0.5 text-xs text-gray-600">{report.reason}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleStartSimulation(report.winner.strategyId)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-gray-800"
          >
            <Play className="h-3.5 w-3.5 fill-current text-teal-400" />
            Simulate Winner
          </button>
        </div>

        {/* Simple 4-Row Comparison Table with Simulate Button per Strategy */}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3">Rank &amp; Strategy</th>
                <th className="px-4 py-3">Total Cost</th>
                <th className="px-4 py-3">Avg Wait</th>
                <th className="px-4 py-3">Priority Wait</th>
                <th className="px-4 py-3">Makespan</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.results.map((r, idx) => {
                const isSimulating = simulatedStrategy === r.strategyId;
                return (
                  <tr
                    key={r.strategyId}
                    className={
                      isSimulating
                        ? 'bg-gray-50 font-semibold'
                        : idx === 0
                        ? 'bg-teal-50/30 font-semibold'
                        : ''
                    }
                  >
                    <td className="px-4 py-3 text-gray-900">
                      <span className="mr-2 font-mono text-gray-400">
                        #{idx + 1}
                      </span>
                      {r.strategyName}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-900">
                      ${r.totalCost.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">
                      {r.averageWaitTimeMs.toLocaleString()} ms
                    </td>
                    <td className="px-4 py-3 font-mono text-teal-700">
                      {r.priorityWaitTimeMs.toLocaleString()} ms
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600">
                      {r.makespanTicks} ticks
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-900">
                      {r.compositeScore}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleStartSimulation(r.strategyId)}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                          isSimulating
                            ? 'bg-gray-900 text-white'
                            : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Play className="h-3 w-3 fill-current" />
                        {isSimulating ? 'Simulating' : 'Simulate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive Replay Simulation of the Uploaded Workload */}
      {simulatedStrategy && (
        <div ref={playbackRef}>
          <WorkloadPlaybackPanel
            tasks={tasks}
            strategyId={simulatedStrategy}
            workloadLabel={workloadLabel}
            onClose={() => setSimulatedStrategy(null)}
          />
        </div>
      )}
    </div>
  );
};
