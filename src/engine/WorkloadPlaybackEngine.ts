import {
  createScheduler,
  SchedulingStrategy,
  SchedulingStrategyId,
} from '../domain/SchedulingStrategy';
import {
  BatchTask,
  InteractiveTask,
  PriorityTask,
  Task,
} from '../domain/Task';
import { MetricDataPoint, MetricsCollector } from './MetricsCollector';
import { ResourceManager } from './ResourceManager';
import { NodeSnapshot, TaskSnapshot } from './SimulationEngine';
import { TaskSpec } from './StrategyEvaluator';

export interface PlaybackSnapshot {
  isRunning: boolean;
  isFinished: boolean;
  currentTick: number;
  speed: number;
  strategyId: SchedulingStrategyId;
  strategyName: string;
  totalTasks: number;
  completedCount: number;
  lastAssignedCount: number;
  queuedTasks: TaskSnapshot[];
  nodes: NodeSnapshot[];
  latestMetrics: MetricDataPoint;
  metricsHistory: MetricDataPoint[];
}

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

export class WorkloadPlaybackEngine {
  private static readonly BASE_TICK_MS = 800;

  private resourceManager = new ResourceManager();
  private metricsCollector = new MetricsCollector();
  private strategy: SchedulingStrategy;
  private taskSpecs: TaskSpec[];

  private pendingByArrival: Task[] = [];
  private pendingIndex = 0;
  private waitingQueue: Task[] = [];
  private completedCount = 0;
  private lastAssignedCount = 0;
  private currentTick = 0;
  private isRunning = false;
  private speed = 2;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: PlaybackSnapshot;

  constructor(taskSpecs: TaskSpec[], strategyId: SchedulingStrategyId) {
    this.taskSpecs = taskSpecs;
    this.strategy = createScheduler(strategyId);
    this.initWorkload();
    this.snapshot = this.buildSnapshot();
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getSnapshot = (): PlaybackSnapshot => this.snapshot;

  public load(taskSpecs: TaskSpec[], strategyId: SchedulingStrategyId): void {
    this.pause();
    this.taskSpecs = taskSpecs;
    this.strategy = createScheduler(strategyId);
    this.resetInternal();
    this.emit();
  }

  public start(): void {
    if (this.isRunning || this.isFinished()) return;
    this.isRunning = true;
    this.restartTimer();
    this.emit();
  }

  public pause(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.clearTimer();
    this.emit();
  }

  public reset(): void {
    this.pause();
    this.resetInternal();
    this.emit();
  }

  public setSpeed(speed: number): void {
    this.speed = speed;
    if (this.isRunning) {
      this.restartTimer();
    }
    this.emit();
  }

  public isFinished(): boolean {
    return (
      this.pendingIndex >= this.pendingByArrival.length &&
      this.waitingQueue.length === 0 &&
      this.resourceManager.getTotalRunningTasks() === 0
    );
  }

  public tick(): void {
    if (this.isFinished()) {
      this.pause();
      return;
    }

    // 1. Enqueue tasks arriving at or before currentTick
    while (
      this.pendingIndex < this.pendingByArrival.length &&
      this.pendingByArrival[this.pendingIndex].arrivalTime <= this.currentTick
    ) {
      this.waitingQueue.push(this.pendingByArrival[this.pendingIndex]);
      this.pendingIndex += 1;
    }

    // 2. Advance running tasks & free completed resources
    const { completedTasks, tickCost } = this.resourceManager.tickAllNodes(
      this.currentTick
    );
    this.completedCount += completedTasks.length;

    // 3. Dispatch waiting tasks with active strategy
    const nodes = this.resourceManager.getNodes();
    const hasCapacity = nodes.some(
      (n) => n.cpu.getAvailable() >= 1 && n.memory.getAvailable() >= 1
    );

    let assigned = 0;
    if (hasCapacity && this.waitingQueue.length > 0) {
      const assignments = this.strategy.schedule(this.waitingQueue, nodes);
      const assignedIds = new Set<string>();
      for (const { task, node } of assignments) {
        if (node.assignTask(task, this.currentTick)) {
          assignedIds.add(task.id);
        }
      }
      if (assignedIds.size > 0) {
        assigned = assignedIds.size;
        this.waitingQueue = this.waitingQueue.filter(
          (t) => !assignedIds.has(t.id)
        );
      }
    }
    this.lastAssignedCount = assigned;

    // 4. Record metrics
    this.metricsCollector.recordTick({
      tick: this.currentTick,
      cpuUtilization: this.resourceManager.getClusterCpuUtilization(),
      memoryUtilization: this.resourceManager.getClusterMemoryUtilization(),
      tickCost,
      newlyCompletedTasks: completedTasks,
      queuedCount: this.waitingQueue.length,
      runningCount: this.resourceManager.getTotalRunningTasks(),
    });

    this.currentTick += 1;

    if (this.isFinished()) {
      this.isRunning = false;
      this.clearTimer();
    }

    this.emit();
  }

  public destroy(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  private initWorkload(): void {
    this.pendingByArrival = this.taskSpecs
      .map(instantiateTask)
      .sort((a, b) => a.arrivalTime - b.arrivalTime);
    this.pendingIndex = 0;
    this.waitingQueue = [];
    this.completedCount = 0;
    this.lastAssignedCount = 0;
    this.currentTick = 0;
  }

  private resetInternal(): void {
    this.resourceManager.reset();
    this.metricsCollector.reset();
    this.strategy = createScheduler(this.strategy.id);
    this.initWorkload();
  }

  private restartTimer(): void {
    this.clearTimer();
    const intervalMs = Math.max(
      60,
      Math.round(WorkloadPlaybackEngine.BASE_TICK_MS / this.speed)
    );
    this.timerId = setInterval(() => {
      this.tick();
    }, intervalMs);
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private toTaskSnapshot(task: Task): TaskSnapshot {
    return {
      id: task.id,
      type: task.type,
      priority: task.priority,
      requiredCpu: task.requiredCpu,
      requiredMemory: task.requiredMemory,
      executionTime: task.executionTime,
      remainingTime: task.remainingTime,
      arrivalTime: task.arrivalTime,
      status: task.status,
      waitTicks: task.getWaitTimeTicks(this.currentTick),
    };
  }

  private buildSnapshot(): PlaybackSnapshot {
    // Cap queuedTasks snapshot preview at 100 for ultra-fast UI rendering on 1000+ task CSVs
    return {
      isRunning: this.isRunning,
      isFinished: this.isFinished(),
      currentTick: this.currentTick,
      speed: this.speed,
      strategyId: this.strategy.id,
      strategyName: this.strategy.name,
      totalTasks: this.pendingByArrival.length,
      completedCount: this.completedCount,
      lastAssignedCount: this.lastAssignedCount,
      queuedTasks: this.waitingQueue
        .slice(0, 100)
        .map((t) => this.toTaskSnapshot(t)),
      nodes: this.resourceManager.getNodes().map((node) => ({
        id: node.id,
        name: node.name,
        nodeType: node.getNodeType(),
        cpuAllocated: node.cpu.allocated,
        cpuCapacity: node.cpu.capacity,
        cpuUtilization: node.getUtilization(),
        memoryAllocated: node.memory.allocated,
        memoryCapacity: node.memory.capacity,
        memoryUtilization: node.getMemoryUtilization(),
        costPerTick: node.costPerTick,
        runningTasks: node.getRunningTasks().map((t) => this.toTaskSnapshot(t)),
      })),
      latestMetrics: this.metricsCollector.getLatest(),
      metricsHistory: this.metricsCollector.getHistory(),
    };
  }
}
