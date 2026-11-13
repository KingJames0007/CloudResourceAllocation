// WebAssembly C++ Engine Bridge
// Connects React directly to the compiled C++ OOP engine

// @ts-ignore
import createStratosModule from './wasm/stratos_engine.js';
import wasmBinaryUrl from './wasm/stratos_engine.wasm?url';
import { NodeSnapshot, TaskSnapshot } from './domain/Snapshots';

export type OptimizationGoal =
  | 'balanced'
  | 'lowest-cost'
  | 'lowest-wait'
  | 'priority-sla';

export interface StrategyEvaluationResult {
  strategyId: string;
  strategyName: string;
  totalCost: number;
  averageWaitTimeMs: number;
  priorityWaitTimeMs: number;
  makespanTicks: number;
  compositeScore: number;
}

export interface BenchmarkReport {
  taskCount: number;
  reason: string;
  winner: {
    strategyId: string;
    strategyName: string;
    compositeScore: number;
  };
  results: StrategyEvaluationResult[];
}

export interface MetricDataPoint {
  tick: number;
  cpuUtilization: number;
  memoryUtilization: number;
  averageWaitTimeMs: number;
  totalCost: number;
  tickCost: number;
  queuedCount: number;
  runningCount: number;
  completedCount: number;
}

export interface PlaybackSnapshot {
  isFinished: boolean;
  currentTick: number;
  strategyId: string;
  strategyName: string;
  totalTasks: number;
  completedCount: number;
  lastAssignedCount: number;
  latestMetrics: MetricDataPoint;
  queuedTasks: TaskSnapshot[];
  nodes: NodeSnapshot[];
}

let stratosWasmInstance: any = null;

export async function initStratosWasm(): Promise<any> {
  if (stratosWasmInstance) {
    return stratosWasmInstance;
  }
  try {
    stratosWasmInstance = await createStratosModule({
      locateFile(path: string) {
        if (path.endsWith('.wasm')) {
          return wasmBinaryUrl;
        }
        return path;
      },
    });
    console.log('[Stratos] C++ WebAssembly Engine initialized successfully');
    return stratosWasmInstance;
  } catch (err) {
    console.error('[Stratos] WebAssembly initialization failed:', err);
    throw err;
  }
}

/**
 * Evaluates all 4 strategies head-to-head via C++ WebAssembly
 */
export async function evaluateWorkloadCppWasm(
  csvContent: string,
  goal: OptimizationGoal
): Promise<BenchmarkReport> {
  const instance = await initStratosWasm();
  const jsonStr = instance.evaluateWorkloadJson(csvContent, goal);
  const parsed = JSON.parse(jsonStr);
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed as BenchmarkReport;
}

/**
 * Loads CSV workload into C++ PlaybackController
 */
export async function loadCppPlayback(csvContent: string, strategyId: string): Promise<void> {
  const instance = await initStratosWasm();
  instance.loadPlaybackCsv(csvContent, strategyId);
}

/**
 * Advances playback by 1 tick inside C++
 */
export async function tickCppPlayback(): Promise<void> {
  const instance = await initStratosWasm();
  instance.tickPlayback();
}

/**
 * Resets playback state inside C++
 */
export async function resetCppPlayback(): Promise<void> {
  const instance = await initStratosWasm();
  instance.resetPlayback();
}

/**
 * Retrieves instantaneous snapshot from C++
 */
export async function getCppPlaybackSnapshot(): Promise<PlaybackSnapshot> {
  const instance = await initStratosWasm();
  const jsonStr = instance.getPlaybackSnapshot();
  return JSON.parse(jsonStr) as PlaybackSnapshot;
}
