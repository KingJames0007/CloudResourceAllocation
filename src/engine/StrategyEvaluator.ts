import {
  createScheduler,
  SchedulingStrategyId,
} from '../domain/SchedulingStrategy';
import {
  BatchTask,
  InteractiveTask,
  PriorityTask,
  Task,
  TaskType,
} from '../domain/Task';
import { MetricsCollector } from './MetricsCollector';
import { ResourceManager } from './ResourceManager';

export interface TaskSpec {
  id: string;
  type: TaskType;
  requiredCpu: number;
  requiredMemory: number;
  executionTime: number;
  arrivalTime: number;
}

export type OptimizationGoal =
  | 'balanced'
  | 'lowest-cost'
  | 'lowest-wait'
  | 'priority-sla';

export interface StrategyEvaluationResult {
  strategyId: SchedulingStrategyId;
  strategyName: string;
  totalCost: number;
  averageWaitTimeMs: number;
  priorityWaitTimeMs: number;
  makespanTicks: number;
  averageCpuUtilization: number;
  completedTasks: number;
  unscheduledTasks: number;
  compositeScore: number; // 0..100 higher is better
}

export interface BenchmarkReport {
  goal: OptimizationGoal;
  taskCount: number;
  winner: StrategyEvaluationResult;
  runnerUp: StrategyEvaluationResult;
  reason: string;
  results: StrategyEvaluationResult[];
}

const ALL_STRATEGIES: SchedulingStrategyId[] = [
  'round-robin',
  'priority',
  'least-loaded',
  'cost-aware',
];

function instantiateTask(spec: TaskSpec): Task {
  const config = {
    id: spec.id,
    requiredCpu: spec.requiredCpu,
    requiredMemory: spec.requiredMemory,
    executionTime: spec.executionTime,
    arrivalTime: spec.arrivalTime,
  };
  switch (spec.type) {
    case 'Priority':
      return new PriorityTask(config);
    case 'Interactive':
      return new InteractiveTask(config);
    case 'Batch':
    default:
      return new BatchTask(config);
  }
}

export class StrategyEvaluator {
  private static readonly MAX_TICKS = 50000;
  private static readonly SIMULATED_MS_PER_TICK = 1000;

  public static evaluate(
    taskSpecs: TaskSpec[],
    goal: OptimizationGoal = 'balanced'
  ): BenchmarkReport {
    if (taskSpecs.length === 0) {
      throw new Error('At least one task is required to evaluate strategies.');
    }

    const rawResults = ALL_STRATEGIES.map((strategyId) =>
      this.runSingleStrategy(strategyId, taskSpecs)
    );

    const scoredResults = this.scoreAndRank(rawResults, goal);
    const winner = scoredResults[0];
    const runnerUp = scoredResults[1] ?? scoredResults[0];

    return {
      goal,
      taskCount: taskSpecs.length,
      winner,
      runnerUp,
      reason: this.buildExplanation(winner, runnerUp, goal),
      results: scoredResults,
    };
  }

  private static runSingleStrategy(
    strategyId: SchedulingStrategyId,
    taskSpecs: TaskSpec[]
  ): Omit<StrategyEvaluationResult, 'compositeScore'> {
    const resourceManager = new ResourceManager();
    const metrics = new MetricsCollector();
    const strategy = createScheduler(strategyId);

    // Clone tasks so each strategy gets an identical independent workload
    const pendingByArrival = taskSpecs
      .map(instantiateTask)
      .sort((a, b) => a.arrivalTime - b.arrivalTime);

    let pendingIndex = 0;
    let waitingQueue: Task[] = [];
    const completedTasks: Task[] = [];
    let tick = 0;
    let cpuSum = 0;

    while (
      (pendingIndex < pendingByArrival.length ||
        waitingQueue.length > 0 ||
        resourceManager.getTotalRunningTasks() > 0) &&
      tick < StrategyEvaluator.MAX_TICKS
    ) {
      // 1. Move tasks whose arrivalTime <= tick into waitingQueue
      while (
        pendingIndex < pendingByArrival.length &&
        pendingByArrival[pendingIndex].arrivalTime <= tick
      ) {
        waitingQueue.push(pendingByArrival[pendingIndex]);
        pendingIndex += 1;
      }

      // 2. Advance running tasks & collect tick cost
      const { completedTasks: newlyDone, tickCost } =
        resourceManager.tickAllNodes(tick);
      completedTasks.push(...newlyDone);

      // 3. Schedule waiting tasks onto nodes (skip if all nodes have 0 available CPU)
      const nodes = resourceManager.getNodes();
      const hasCapacity = nodes.some(
        (n) => n.cpu.getAvailable() >= 1 && n.memory.getAvailable() >= 1
      );

      if (hasCapacity && waitingQueue.length > 0) {
        const assignments = strategy.schedule(waitingQueue, nodes);
        const assignedIds = new Set<string>();

        for (const { task, node } of assignments) {
          if (node.assignTask(task, tick)) {
            assignedIds.add(task.id);
          }
        }

        if (assignedIds.size > 0) {
          waitingQueue = waitingQueue.filter((t) => !assignedIds.has(t.id));
        }
      }

      // 4. Record metrics
      const cpuUtil = resourceManager.getClusterCpuUtilization();
      cpuSum += cpuUtil;

      metrics.recordTick({
        tick,
        cpuUtilization: cpuUtil,
        memoryUtilization: resourceManager.getClusterMemoryUtilization(),
        tickCost,
        newlyCompletedTasks: newlyDone,
        queuedCount: waitingQueue.length,
        runningCount: resourceManager.getTotalRunningTasks(),
      });

      if (
        pendingIndex >= pendingByArrival.length &&
        waitingQueue.length === 0 &&
        resourceManager.getTotalRunningTasks() === 0
      ) {
        break;
      }

      tick += 1;
    }

    const latest = metrics.getLatest();
    const priorityTasks = completedTasks.filter((t) => t.type === 'Priority');
    const priorityWaitTimeMs =
      priorityTasks.length > 0
        ? Math.round(
            (priorityTasks.reduce(
              (sum, t) => sum + t.getWaitTimeTicks(tick),
              0
            ) /
              priorityTasks.length) *
              StrategyEvaluator.SIMULATED_MS_PER_TICK
          )
        : latest.averageWaitTimeMs;

    return {
      strategyId,
      strategyName: strategy.name,
      totalCost: latest.totalCost,
      averageWaitTimeMs: latest.averageWaitTimeMs,
      priorityWaitTimeMs,
      makespanTicks: tick,
      averageCpuUtilization: Number((cpuSum / Math.max(1, tick + 1)).toFixed(1)),
      completedTasks: completedTasks.length,
      unscheduledTasks:
        waitingQueue.length + (pendingByArrival.length - pendingIndex),
    };
  }

  private static scoreAndRank(
    results: Omit<StrategyEvaluationResult, 'compositeScore'>[],
    goal: OptimizationGoal
  ): StrategyEvaluationResult[] {
    const minCost = Math.min(...results.map((r) => r.totalCost));
    const maxCost = Math.max(...results.map((r) => r.totalCost));
    const minWait = Math.min(...results.map((r) => r.averageWaitTimeMs));
    const maxWait = Math.max(...results.map((r) => r.averageWaitTimeMs));
    const minPrioWait = Math.min(...results.map((r) => r.priorityWaitTimeMs));
    const maxPrioWait = Math.max(...results.map((r) => r.priorityWaitTimeMs));
    const minMake = Math.min(...results.map((r) => r.makespanTicks));
    const maxMake = Math.max(...results.map((r) => r.makespanTicks));

    const normalizeLowerBetter = (val: number, min: number, max: number) =>
      max === min ? 1 : 1 - (val - min) / (max - min);

    const weights: Record<
      OptimizationGoal,
      { cost: number; wait: number; prio: number; make: number }
    > = {
      balanced: { cost: 0.35, wait: 0.3, prio: 0.2, make: 0.15 },
      'lowest-cost': { cost: 0.7, wait: 0.15, prio: 0.05, make: 0.1 },
      'lowest-wait': { cost: 0.1, wait: 0.65, prio: 0.15, make: 0.1 },
      'priority-sla': { cost: 0.1, wait: 0.2, prio: 0.6, make: 0.1 },
    };

    const w = weights[goal];

    return results
      .map((r) => {
        const completionPenalty = r.unscheduledTasks > 0 ? 0.5 : 1;
        const score =
          (w.cost * normalizeLowerBetter(r.totalCost, minCost, maxCost) +
            w.wait * normalizeLowerBetter(r.averageWaitTimeMs, minWait, maxWait) +
            w.prio *
              normalizeLowerBetter(
                r.priorityWaitTimeMs,
                minPrioWait,
                maxPrioWait
              ) +
            w.make *
              normalizeLowerBetter(r.makespanTicks, minMake, maxMake)) *
          100 *
          completionPenalty;

        return {
          ...r,
          compositeScore: Number(score.toFixed(1)),
        };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore);
  }

  private static buildExplanation(
    winner: StrategyEvaluationResult,
    runnerUp: StrategyEvaluationResult,
    goal: OptimizationGoal
  ): string {
    const costSaved = (runnerUp.totalCost - winner.totalCost).toFixed(2);
    const waitDiff = runnerUp.averageWaitTimeMs - winner.averageWaitTimeMs;

    if (goal === 'lowest-cost') {
      return `${winner.strategyName} is superior for cost efficiency, completing ${winner.completedTasks} tasks at $${winner.totalCost.toFixed(2)} (${Number(costSaved) > 0 ? `$${costSaved} cheaper than ${runnerUp.strategyName}` : 'lowest overall cluster spend'}).`;
    }
    if (goal === 'priority-sla') {
      return `${winner.strategyName} is superior for Priority SLA, keeping high-priority task wait time at ${winner.priorityWaitTimeMs} ms across ${winner.makespanTicks} ticks.`;
    }
    if (goal === 'lowest-wait') {
      return `${winner.strategyName} is superior for latency, achieving an average wait time of ${winner.averageWaitTimeMs} ms${waitDiff > 0 ? ` (${waitDiff} ms faster than ${runnerUp.strategyName})` : ''}.`;
    }

    return `${winner.strategyName} achieved the highest balanced score (${winner.compositeScore}/100) with $${winner.totalCost.toFixed(2)} total cost, ${winner.averageWaitTimeMs} ms avg wait, and ${winner.makespanTicks}-tick makespan.`;
  }
}

export const PRESET_WORKLOADS: Record<
  string,
  { label: string; tasks: TaskSpec[] }
> = {
  'mixed-cloud': {
    label: 'Mixed Cloud Traffic (12 tasks)',
    tasks: [
      { id: 'W-01', type: 'Batch', requiredCpu: 4, requiredMemory: 16, executionTime: 6, arrivalTime: 0 },
      { id: 'W-02', type: 'Priority', requiredCpu: 4, requiredMemory: 12, executionTime: 3, arrivalTime: 0 },
      { id: 'W-03', type: 'Interactive', requiredCpu: 2, requiredMemory: 8, executionTime: 4, arrivalTime: 0 },
      { id: 'W-04', type: 'Batch', requiredCpu: 6, requiredMemory: 20, executionTime: 8, arrivalTime: 1 },
      { id: 'W-05', type: 'Priority', requiredCpu: 3, requiredMemory: 8, executionTime: 2, arrivalTime: 1 },
      { id: 'W-06', type: 'Interactive', requiredCpu: 2, requiredMemory: 6, executionTime: 4, arrivalTime: 2 },
      { id: 'W-07', type: 'Batch', requiredCpu: 5, requiredMemory: 16, executionTime: 7, arrivalTime: 2 },
      { id: 'W-08', type: 'Priority', requiredCpu: 4, requiredMemory: 10, executionTime: 3, arrivalTime: 3 },
      { id: 'W-09', type: 'Interactive', requiredCpu: 3, requiredMemory: 8, executionTime: 5, arrivalTime: 3 },
      { id: 'W-10', type: 'Batch', requiredCpu: 4, requiredMemory: 12, executionTime: 6, arrivalTime: 4 },
      { id: 'W-11', type: 'Priority', requiredCpu: 2, requiredMemory: 6, executionTime: 2, arrivalTime: 4 },
      { id: 'W-12', type: 'Interactive', requiredCpu: 3, requiredMemory: 8, executionTime: 4, arrivalTime: 5 },
    ],
  },
  'priority-spike': {
    label: 'Contention & Priority Spike (10 tasks)',
    tasks: [
      { id: 'S-01', type: 'Batch', requiredCpu: 8, requiredMemory: 28, executionTime: 8, arrivalTime: 0 },
      { id: 'S-02', type: 'Batch', requiredCpu: 8, requiredMemory: 28, executionTime: 8, arrivalTime: 0 },
      { id: 'S-03', type: 'Batch', requiredCpu: 8, requiredMemory: 28, executionTime: 8, arrivalTime: 0 },
      { id: 'S-04', type: 'Batch', requiredCpu: 8, requiredMemory: 28, executionTime: 8, arrivalTime: 0 },
      { id: 'S-05', type: 'Batch', requiredCpu: 8, requiredMemory: 28, executionTime: 8, arrivalTime: 0 },
      { id: 'S-06', type: 'Batch', requiredCpu: 8, requiredMemory: 28, executionTime: 8, arrivalTime: 0 },
      { id: 'S-07', type: 'Batch', requiredCpu: 8, requiredMemory: 28, executionTime: 8, arrivalTime: 0 },
      { id: 'S-08', type: 'Priority', requiredCpu: 4, requiredMemory: 12, executionTime: 2, arrivalTime: 1 },
      { id: 'S-09', type: 'Priority', requiredCpu: 4, requiredMemory: 12, executionTime: 2, arrivalTime: 1 },
      { id: 'S-10', type: 'Interactive', requiredCpu: 4, requiredMemory: 12, executionTime: 3, arrivalTime: 1 },
    ],
  },
};
