import { CPUResource, MemoryResource, StorageResource } from './Resource';
import { Task } from './Task';

export type NodeType = 'PhysicalServer' | 'VirtualMachine';

export abstract class ComputeNode {
  public readonly id: string;
  public readonly name: string;
  public readonly cpu: CPUResource;
  public readonly memory: MemoryResource;
  public readonly storage: StorageResource;
  public costPerTick: number;
  protected runningTasks: Task[] = [];
  protected activeTicks = 0;

  constructor(
    id: string,
    name: string,
    cpuCapacity: number,
    memoryCapacity: number,
    storageCapacity: number,
    costPerTick: number
  ) {
    this.id = id;
    this.name = name;
    this.cpu = new CPUResource(cpuCapacity);
    this.memory = new MemoryResource(memoryCapacity);
    this.storage = new StorageResource(storageCapacity);
    this.costPerTick = costPerTick;
  }

  public canFit(task: Task): boolean {
    return (
      this.cpu.canAllocate(task.requiredCpu) &&
      this.memory.canAllocate(task.requiredMemory)
    );
  }

  public assignTask(task: Task, currentTick = 0): boolean {
    if (!this.canFit(task)) {
      return false;
    }
    this.cpu.allocate(task.requiredCpu);
    this.memory.allocate(task.requiredMemory);
    task.markRunning(this.id, currentTick);
    this.runningTasks.push(task);
    return true;
  }

  public freeResources(task: Task): void {
    const index = this.runningTasks.findIndex((t) => t.id === task.id);
    if (index === -1) {
      return;
    }
    this.runningTasks.splice(index, 1);
    this.cpu.release(task.requiredCpu);
    this.memory.release(task.requiredMemory);
  }

  public getUtilization(): number {
    return this.cpu.getUtilization();
  }

  public getMemoryUtilization(): number {
    return this.memory.getUtilization();
  }

  public getRunningTasks(): readonly Task[] {
    return this.runningTasks;
  }

  public getActiveTicks(): number {
    return this.activeTicks;
  }

  public reset(): void {
    this.runningTasks = [];
    this.activeTicks = 0;
    this.cpu.reset();
    this.memory.reset();
    this.storage.reset();
  }

  public abstract getNodeType(): NodeType;
  public abstract calculateTickCost(): number;
}

/**
 * PhysicalServer: High capacity, high fixed cost per tick regardless of load.
 */
export class PhysicalServer extends ComputeNode {
  private readonly fixedCostPerTick: number;

  constructor(
    id: string,
    name: string,
    cpuCapacity = 32,
    memoryCapacity = 128,
    storageCapacity = 2000,
    fixedCostPerTick = 1.85
  ) {
    super(id, name, cpuCapacity, memoryCapacity, storageCapacity, fixedCostPerTick);
    this.fixedCostPerTick = fixedCostPerTick;
  }

  public getNodeType(): NodeType {
    return 'PhysicalServer';
  }

  public calculateTickCost(): number {
    if (this.runningTasks.length > 0) {
      this.activeTicks += 1;
    }
    this.costPerTick = this.fixedCostPerTick;
    return this.fixedCostPerTick;
  }
}

/**
 * VirtualMachine: Lower capacity, cost scales dynamically based on time and active utilization.
 */
export class VirtualMachine extends ComputeNode {
  private readonly baseRatePerTick: number;

  constructor(
    id: string,
    name: string,
    cpuCapacity = 8,
    memoryCapacity = 32,
    storageCapacity = 500,
    baseRatePerTick = 0.35
  ) {
    super(id, name, cpuCapacity, memoryCapacity, storageCapacity, baseRatePerTick);
    this.baseRatePerTick = baseRatePerTick;
  }

  public getNodeType(): NodeType {
    return 'VirtualMachine';
  }

  public calculateTickCost(): number {
    if (this.runningTasks.length === 0) {
      // Idle VMs incur minimal standby cost
      this.costPerTick = Number((this.baseRatePerTick * 0.2).toFixed(4));
      return this.costPerTick;
    }

    this.activeTicks += 1;
    const utilizationFactor = 1 + this.getUtilization() / 100;
    // Slight time-based elasticity scaling for sustained bursts
    const timeScaling = 1 + Math.min(0.35, this.activeTicks * 0.005);
    this.costPerTick = Number(
      (this.baseRatePerTick * utilizationFactor * timeScaling).toFixed(4)
    );
    return this.costPerTick;
  }

  public override reset(): void {
    super.reset();
    this.costPerTick = this.baseRatePerTick;
  }
}
