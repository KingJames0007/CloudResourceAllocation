export type NodeType = 'PhysicalServer' | 'VirtualMachine';
export type TaskStatus = 'waiting' | 'running' | 'completed';
export type TaskType = 'Batch' | 'Interactive' | 'Priority';

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
