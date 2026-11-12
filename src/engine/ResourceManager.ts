import { ComputeNode, PhysicalServer, VirtualMachine } from '../domain/ComputeNode';
import { Task } from '../domain/Task';

export interface NodeTickResult {
  completedTasks: Task[];
  tickCost: number;
}

export class ResourceManager {
  private nodes: ComputeNode[];

  constructor(initialNodes?: ComputeNode[]) {
    this.nodes = initialNodes ?? ResourceManager.createDefaultCluster();
  }

  public static createDefaultCluster(): ComputeNode[] {
    return [
      new PhysicalServer('ps-01', 'BareMetal Alpha', 32, 128, 2000, 1.85),
      new PhysicalServer('ps-02', 'BareMetal Beta', 32, 128, 2000, 1.85),
      new VirtualMachine('vm-01', 'Elastic VM-01', 8, 32, 500, 0.35),
      new VirtualMachine('vm-02', 'Elastic VM-02', 8, 32, 500, 0.35),
      new VirtualMachine('vm-03', 'Elastic VM-03', 12, 48, 750, 0.52),
      new VirtualMachine('vm-04', 'Elastic VM-04', 6, 24, 400, 0.28),
    ];
  }

  public getNodes(): ComputeNode[] {
    return this.nodes;
  }

  public getNodeById(id: string): ComputeNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  public getClusterCpuUtilization(): number {
    let totalCapacity = 0;
    let totalAllocated = 0;
    for (const node of this.nodes) {
      totalCapacity += node.cpu.capacity;
      totalAllocated += node.cpu.allocated;
    }
    if (totalCapacity === 0) return 0;
    return Number(((totalAllocated / totalCapacity) * 100).toFixed(2));
  }

  public getClusterMemoryUtilization(): number {
    let totalCapacity = 0;
    let totalAllocated = 0;
    for (const node of this.nodes) {
      totalCapacity += node.memory.capacity;
      totalAllocated += node.memory.allocated;
    }
    if (totalCapacity === 0) return 0;
    return Number(((totalAllocated / totalCapacity) * 100).toFixed(2));
  }

  public getTotalRunningTasks(): number {
    return this.nodes.reduce((sum, node) => sum + node.getRunningTasks().length, 0);
  }

  public tickAllNodes(currentTick: number): NodeTickResult {
    const completedTasks: Task[] = [];
    let tickCost = 0;

    for (const node of this.nodes) {
      // Calculate cost for this tick before freeing completed tasks
      tickCost += node.calculateTickCost();

      // Snapshot running tasks because freeResources mutates the node's runningTasks array
      const activeTasks = [...node.getRunningTasks()];
      for (const task of activeTasks) {
        const isFinished = task.tickExecution();
        if (isFinished) {
          task.markCompleted(currentTick);
          node.freeResources(task);
          completedTasks.push(task);
        }
      }
    }

    return {
      completedTasks,
      tickCost: Number(tickCost.toFixed(4)),
    };
  }

  public reset(): void {
    for (const node of this.nodes) {
      node.reset();
    }
  }
}
