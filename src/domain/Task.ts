export type TaskStatus = 'waiting' | 'running' | 'completed';
export type TaskType = 'Batch' | 'Interactive' | 'Priority';

export interface TaskConfig {
  id: string;
  requiredCpu: number;
  requiredMemory: number;
  executionTime: number;
  arrivalTime: number;
}

export abstract class Task {
  public readonly id: string;
  public readonly requiredCpu: number;
  public readonly requiredMemory: number;
  public readonly executionTime: number;
  public readonly arrivalTime: number;
  public status: TaskStatus;
  public remainingTime: number;
  public startTime: number | null = null;
  public completionTime: number | null = null;
  public assignedNodeId: string | null = null;

  public abstract readonly priority: number;
  public abstract readonly type: TaskType;

  constructor(config: TaskConfig) {
    this.id = config.id;
    this.requiredCpu = config.requiredCpu;
    this.requiredMemory = config.requiredMemory;
    this.executionTime = config.executionTime;
    this.arrivalTime = config.arrivalTime;
    this.remainingTime = config.executionTime;
    this.status = 'waiting';
  }

  public markRunning(nodeId: string, currentTick: number): void {
    this.status = 'running';
    this.assignedNodeId = nodeId;
    if (this.startTime === null) {
      this.startTime = currentTick;
    }
  }

  public tickExecution(): boolean {
    if (this.status !== 'running') {
      return false;
    }
    this.remainingTime = Math.max(0, this.remainingTime - 1);
    return this.remainingTime === 0;
  }

  public markCompleted(currentTick: number): void {
    this.status = 'completed';
    this.remainingTime = 0;
    this.completionTime = currentTick;
  }

  public getWaitTimeTicks(currentTick: number): number {
    if (this.startTime !== null) {
      return Math.max(0, this.startTime - this.arrivalTime);
    }
    return Math.max(0, currentTick - this.arrivalTime);
  }
}

export class BatchTask extends Task {
  public readonly priority = 1;
  public readonly type: TaskType = 'Batch';
}

export class InteractiveTask extends Task {
  public readonly priority = 2;
  public readonly type: TaskType = 'Interactive';
}

export class PriorityTask extends Task {
  public readonly priority = 3;
  public readonly type: TaskType = 'Priority';
}
