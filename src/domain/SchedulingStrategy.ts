import { ComputeNode } from './ComputeNode';
import { Task } from './Task';

export interface Assignment {
  task: Task;
  node: ComputeNode;
}

export interface SchedulingStrategy {
  readonly id: SchedulingStrategyId;
  readonly name: string;
  readonly description: string;
  schedule(taskQueue: Task[], computeNodes: ComputeNode[]): Assignment[];
}

export type SchedulingStrategyId =
  | 'round-robin'
  | 'priority'
  | 'least-loaded'
  | 'cost-aware';

/**
 * Helper to track virtual resource reservations during a single scheduling batch
 * so multiple tasks in the same tick don't over-commit a node before assignTask() is called.
 */
interface NodeProjection {
  node: ComputeNode;
  projectedCpu: number;
  projectedMemory: number;
}

function createProjections(computeNodes: ComputeNode[]): NodeProjection[] {
  return computeNodes.map((node) => ({
    node,
    projectedCpu: node.cpu.allocated,
    projectedMemory: node.memory.allocated,
  }));
}

function canFitProjected(proj: NodeProjection, task: Task): boolean {
  return (
    proj.projectedCpu + task.requiredCpu <= proj.node.cpu.capacity + 1e-9 &&
    proj.projectedMemory + task.requiredMemory <= proj.node.memory.capacity + 1e-9
  );
}

function reserveProjected(proj: NodeProjection, task: Task): void {
  proj.projectedCpu += task.requiredCpu;
  proj.projectedMemory += task.requiredMemory;
}

function getProjectedCpuUtilization(proj: NodeProjection): number {
  return (proj.projectedCpu / proj.node.cpu.capacity) * 100;
}

/**
 * Cycles through compute nodes sequentially.
 */
export class RoundRobinScheduler implements SchedulingStrategy {
  public readonly id: SchedulingStrategyId = 'round-robin';
  public readonly name = 'Round Robin';
  public readonly description = 'Cycles through nodes sequentially for fair distribution';
  private nextIndex = 0;

  public schedule(taskQueue: Task[], computeNodes: ComputeNode[]): Assignment[] {
    if (computeNodes.length === 0 || taskQueue.length === 0) {
      return [];
    }

    const projections = createProjections(computeNodes);
    const assignments: Assignment[] = [];

    for (const task of taskQueue) {
      let assigned = false;
      for (let offset = 0; offset < projections.length; offset++) {
        const idx = (this.nextIndex + offset) % projections.length;
        const candidate = projections[idx];
        if (canFitProjected(candidate, task)) {
          reserveProjected(candidate, task);
          assignments.push({ task, node: candidate.node });
          this.nextIndex = (idx + 1) % projections.length;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        // Keep queue order intact if no node has capacity
        continue;
      }
    }

    return assignments;
  }

  public reset(): void {
    this.nextIndex = 0;
  }
}

/**
 * Sorts queue by task priority (Priority > Interactive > Batch), then fits into first available node.
 */
export class PriorityScheduler implements SchedulingStrategy {
  public readonly id: SchedulingStrategyId = 'priority';
  public readonly name = 'Priority Queue';
  public readonly description = 'Sorts tasks by priority level, fitting into first available node';

  public schedule(taskQueue: Task[], computeNodes: ComputeNode[]): Assignment[] {
    if (computeNodes.length === 0 || taskQueue.length === 0) {
      return [];
    }

    const projections = createProjections(computeNodes);
    const sortedTasks = [...taskQueue].sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.arrivalTime - b.arrivalTime;
    });

    const assignments: Assignment[] = [];

    for (const task of sortedTasks) {
      const candidate = projections.find((proj) => canFitProjected(proj, task));
      if (candidate) {
        reserveProjected(candidate, task);
        assignments.push({ task, node: candidate.node });
      }
    }

    return assignments;
  }
}

/**
 * Evaluates getUtilization() of all nodes and assigns to the node with the lowest current CPU%.
 */
export class LeastLoadedScheduler implements SchedulingStrategy {
  public readonly id: SchedulingStrategyId = 'least-loaded';
  public readonly name = 'Least Loaded';
  public readonly description = 'Targets the compute node with the lowest real-time CPU utilization';

  public schedule(taskQueue: Task[], computeNodes: ComputeNode[]): Assignment[] {
    if (computeNodes.length === 0 || taskQueue.length === 0) {
      return [];
    }

    const projections = createProjections(computeNodes);
    const assignments: Assignment[] = [];

    for (const task of taskQueue) {
      let bestCandidate: NodeProjection | null = null;
      let lowestUtil = Number.POSITIVE_INFINITY;

      for (const proj of projections) {
        if (!canFitProjected(proj, task)) {
          continue;
        }
        // Use node.getUtilization() as baseline + any batch projection delta
        const baseUtil = proj.node.getUtilization();
        const projectedUtil = getProjectedCpuUtilization(proj);
        const effectiveUtil = Math.max(baseUtil, projectedUtil);

        if (effectiveUtil < lowestUtil) {
          lowestUtil = effectiveUtil;
          bestCandidate = proj;
        }
      }

      if (bestCandidate) {
        reserveProjected(bestCandidate, task);
        assignments.push({ task, node: bestCandidate.node });
      }
    }

    return assignments;
  }
}

/**
 * Evaluates node costPerTick and assigns to the cheapest node with enough available resources.
 */
export class CostAwareScheduler implements SchedulingStrategy {
  public readonly id: SchedulingStrategyId = 'cost-aware';
  public readonly name = 'Cost-Aware';
  public readonly description = 'Selects the lowest cost-per-tick node with sufficient capacity';

  public schedule(taskQueue: Task[], computeNodes: ComputeNode[]): Assignment[] {
    if (computeNodes.length === 0 || taskQueue.length === 0) {
      return [];
    }

    const projections = createProjections(computeNodes);
    const assignments: Assignment[] = [];

    for (const task of taskQueue) {
      const eligible = projections
        .filter((proj) => canFitProjected(proj, task))
        .sort((a, b) => a.node.costPerTick - b.node.costPerTick);

      if (eligible.length > 0) {
        const cheapest = eligible[0];
        reserveProjected(cheapest, task);
        assignments.push({ task, node: cheapest.node });
      }
    }

    return assignments;
  }
}

export function createScheduler(id: SchedulingStrategyId): SchedulingStrategy {
  switch (id) {
    case 'round-robin':
      return new RoundRobinScheduler();
    case 'priority':
      return new PriorityScheduler();
    case 'least-loaded':
      return new LeastLoadedScheduler();
    case 'cost-aware':
      return new CostAwareScheduler();
  }
}
