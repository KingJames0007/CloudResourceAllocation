import { NodeType } from '../domain/ComputeNode';
import {
  createScheduler,
  SchedulingStrategy,
  SchedulingStrategyId,
} from '../domain/SchedulingStrategy';
import { Task, TaskStatus, TaskType } from '../domain/Task';
import { MetricDataPoint, MetricsCollector } from './MetricsCollector';
import { ResourceManager } from './ResourceManager';
import { TaskQueue } from './TaskQueue';

export interface TaskSnapshot {
  id: string;
  type: TaskType;
  priority: number;
  requiredCpu: number;
  requiredMemory: number;
  executionTime: number;
  remainingTime: number;
  arrivalTime: number;
  status: TaskStatus;
  waitTicks: number;
}

export interface NodeSnapshot {
  id: string;
  name: string;
  nodeType: NodeType;
  cpuAllocated: number;
  cpuCapacity: number;
  cpuUtilization: number;
  memoryAllocated: number;
  memoryCapacity: number;
  memoryUtilization: number;
  costPerTick: number;
  runningTasks: TaskSnapshot[];
}

export interface SimulationSnapshot {
  isRunning: boolean;
  currentTick: number;
  strategyId: SchedulingStrategyId;
  strategyName: string;
  strategyDescription: string;
  arrivalRate: number;
  simulationSpeed: number; // multiplier: 0.5x to 4x (base tick 1000ms)
  queuedTasks: TaskSnapshot[];
  nodes: NodeSnapshot[];
  latestMetrics: MetricDataPoint;
  metricsHistory: MetricDataPoint[];
  lastAssignedCount: number;
}

type Listener = () => void;

export class SimulationEngine {
  private static instance: SimulationEngine | null = null;
  private static readonly BASE_TICK_MS = 1000;

  private resourceManager: ResourceManager;
  private taskQueue: TaskQueue;
  private metricsCollector: MetricsCollector;
  private strategy: SchedulingStrategy;

  private isRunning = false;
  private currentTick = 0;
  private arrivalRate = 1.6;
  private simulationSpeed = 1.0;
  private lastAssignedCount = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();
  private snapshot: SimulationSnapshot;

  private constructor() {
    this.resourceManager = new ResourceManager();
    this.taskQueue = new TaskQueue();
    this.metricsCollector = new MetricsCollector();
    this.strategy = createScheduler('round-robin');

    // Seed initial tasks so the dashboard looks alive immediately on load
    for (let i = 0; i < 5; i++) {
      this.taskQueue.enqueue(this.taskQueue.createRandomTask(0));
    }
    this.snapshot = this.buildSnapshot();
  }

  public static getInstance(): SimulationEngine {
    if (!SimulationEngine.instance) {
      SimulationEngine.instance = new SimulationEngine();
    }
    return SimulationEngine.instance;
  }

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): SimulationSnapshot => {
    return this.snapshot;
  };

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.restartInterval();
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
    this.currentTick = 0;
    this.lastAssignedCount = 0;
    this.resourceManager.reset();
    this.taskQueue.reset();
    this.metricsCollector.reset();
    this.strategy = createScheduler(this.strategy.id);

    for (let i = 0; i < 5; i++) {
      this.taskQueue.enqueue(this.taskQueue.createRandomTask(0));
    }
    this.emit();
  }

  public setStrategy(strategyId: SchedulingStrategyId): void {
    this.strategy = createScheduler(strategyId);
    this.emit();
  }

  public setArrivalRate(rate: number): void {
    this.arrivalRate = Math.max(0.2, Math.min(5.0, Number(rate.toFixed(1))));
    this.emit();
  }

  public setSimulationSpeed(speed: number): void {
    this.simulationSpeed = Math.max(0.5, Math.min(4.0, Number(speed.toFixed(1))));
    if (this.isRunning) {
      this.restartInterval();
    }
    this.emit();
  }

  public injectBurst(count = 6): void {
    for (let i = 0; i < count; i++) {
      this.taskQueue.enqueue(this.taskQueue.createRandomTask(this.currentTick));
    }
    this.emit();
  }

  public tick(): void {
    this.currentTick += 1;

    // 1. Advance running tasks & free resources for completed ones
    const { completedTasks, tickCost } = this.resourceManager.tickAllNodes(
      this.currentTick
    );

    // 2. Generate incoming tasks according to arrival rate
    this.taskQueue.generateTasks(this.currentTick, this.arrivalRate);

    // 3. Schedule queued tasks onto compute nodes using active SchedulingStrategy
    const waitingTasks = this.taskQueue.getTasks();
    const nodes = this.resourceManager.getNodes();
    const assignments = this.strategy.schedule(waitingTasks, nodes);

    const assignedTaskIds = new Set<string>();
    for (const { task, node } of assignments) {
      if (node.assignTask(task, this.currentTick)) {
        assignedTaskIds.add(task.id);
      }
    }
    this.taskQueue.removeTasks(assignedTaskIds);
    this.lastAssignedCount = assignedTaskIds.size;

    // 4. Collect cluster-wide metrics for this tick
    this.metricsCollector.recordTick({
      tick: this.currentTick,
      cpuUtilization: this.resourceManager.getClusterCpuUtilization(),
      memoryUtilization: this.resourceManager.getClusterMemoryUtilization(),
      tickCost,
      newlyCompletedTasks: completedTasks,
      queuedCount: this.taskQueue.size(),
      runningCount: this.resourceManager.getTotalRunningTasks(),
    });

    this.emit();
  }

  private restartInterval(): void {
    this.clearTimer();
    const intervalMs = Math.max(
      200,
      Math.round(SimulationEngine.BASE_TICK_MS / this.simulationSpeed)
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

  private buildSnapshot(): SimulationSnapshot {
    return {
      isRunning: this.isRunning,
      currentTick: this.currentTick,
      strategyId: this.strategy.id,
      strategyName: this.strategy.name,
      strategyDescription: this.strategy.description,
      arrivalRate: this.arrivalRate,
      simulationSpeed: this.simulationSpeed,
      queuedTasks: this.taskQueue.getTasks().map((t) => this.toTaskSnapshot(t)),
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
      lastAssignedCount: this.lastAssignedCount,
    };
  }
}
