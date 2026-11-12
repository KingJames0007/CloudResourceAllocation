import { Task } from '../domain/Task';

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

export class MetricsCollector {
  private static readonly MAX_HISTORY = 50;
  private static readonly SIMULATED_MS_PER_TICK = 1000;

  private history: MetricDataPoint[] = [];
  private totalCost = 0;
  private totalCompletedWaitTicks = 0;
  private completedTaskCount = 0;

  public recordTick(params: {
    tick: number;
    cpuUtilization: number;
    memoryUtilization: number;
    tickCost: number;
    newlyCompletedTasks: Task[];
    queuedCount: number;
    runningCount: number;
  }): MetricDataPoint {
    this.totalCost = Number((this.totalCost + params.tickCost).toFixed(2));

    for (const task of params.newlyCompletedTasks) {
      const waitTicks = task.getWaitTimeTicks(params.tick);
      this.totalCompletedWaitTicks += waitTicks;
      this.completedTaskCount += 1;
    }

    const avgWaitTicks =
      this.completedTaskCount > 0
        ? this.totalCompletedWaitTicks / this.completedTaskCount
        : 0;

    const point: MetricDataPoint = {
      tick: params.tick,
      cpuUtilization: params.cpuUtilization,
      memoryUtilization: params.memoryUtilization,
      averageWaitTimeMs: Math.round(avgWaitTicks * MetricsCollector.SIMULATED_MS_PER_TICK),
      totalCost: this.totalCost,
      tickCost: Number(params.tickCost.toFixed(2)),
      queuedCount: params.queuedCount,
      runningCount: params.runningCount,
      completedCount: this.completedTaskCount,
    };

    this.history.push(point);
    if (this.history.length > MetricsCollector.MAX_HISTORY) {
      this.history.shift();
    }

    return point;
  }

  public getHistory(): MetricDataPoint[] {
    return [...this.history];
  }

  public getLatest(): MetricDataPoint {
    if (this.history.length === 0) {
      return {
        tick: 0,
        cpuUtilization: 0,
        memoryUtilization: 0,
        averageWaitTimeMs: 0,
        totalCost: 0,
        tickCost: 0,
        queuedCount: 0,
        runningCount: 0,
        completedCount: 0,
      };
    }
    return this.history[this.history.length - 1];
  }

  public reset(): void {
    this.history = [];
    this.totalCost = 0;
    this.totalCompletedWaitTicks = 0;
    this.completedTaskCount = 0;
  }
}
