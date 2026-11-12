import { describe, expect, it } from 'vitest';
import { PhysicalServer, VirtualMachine } from '../ComputeNode';
import { CPUResource, MemoryResource, StorageResource } from '../Resource';
import {
  CostAwareScheduler,
  LeastLoadedScheduler,
  PriorityScheduler,
  RoundRobinScheduler,
} from '../SchedulingStrategy';
import { BatchTask, InteractiveTask, PriorityTask } from '../Task';
import { SimulationEngine } from '../../engine/SimulationEngine';
import {
  generateSampleTasksCsv,
  parseTasksCsv,
} from '../../engine/CsvTaskParser';
import {
  PRESET_WORKLOADS,
  StrategyEvaluator,
} from '../../engine/StrategyEvaluator';
import { WorkloadPlaybackEngine } from '../../engine/WorkloadPlaybackEngine';

describe('Resource Hierarchy', () => {
  it('allocates, releases, and computes utilization accurately', () => {
    const cpu = new CPUResource(16);
    const mem = new MemoryResource(64);
    const storage = new StorageResource(500);

    expect(cpu.allocate(4)).toBe(true);
    expect(cpu.getAvailable()).toBe(12);
    expect(cpu.getUtilization()).toBe(25);

    expect(cpu.allocate(20)).toBe(false);
    cpu.release(4);
    expect(cpu.allocated).toBe(0);

    expect(mem.unit).toBe('GB');
    expect(storage.unit).toBe('GB');
  });
});

describe('ComputeNode & Task Hierarchy', () => {
  it('assigns and frees resources on PhysicalServer and VirtualMachine', () => {
    const ps = new PhysicalServer('ps-1', 'Server 1', 32, 128, 2000, 1.85);
    const vm = new VirtualMachine('vm-1', 'VM 1', 8, 32, 500, 0.35);

    const task = new PriorityTask({
      id: 'T-1',
      requiredCpu: 4,
      requiredMemory: 16,
      executionTime: 2,
      arrivalTime: 0,
    });

    expect(ps.assignTask(task, 1)).toBe(true);
    expect(ps.getUtilization()).toBe(12.5);
    expect(ps.calculateTickCost()).toBe(1.85);
    ps.freeResources(task);
    expect(ps.getUtilization()).toBe(0);

    // VirtualMachine scales cost when active vs idle
    const idleCost = vm.calculateTickCost();
    const vmTask = new BatchTask({
      id: 'T-2',
      requiredCpu: 4,
      requiredMemory: 8,
      executionTime: 3,
      arrivalTime: 0,
    });
    vm.assignTask(vmTask, 1);
    const activeCost = vm.calculateTickCost();
    expect(activeCost).toBeGreaterThan(idleCost);
  });
});

describe('Scheduling Strategies', () => {
  it('RoundRobinScheduler cycles through nodes sequentially', () => {
    const nodes = [
      new VirtualMachine('vm-1', 'VM 1', 8, 32, 500, 0.35),
      new VirtualMachine('vm-2', 'VM 2', 8, 32, 500, 0.35),
    ];
    const tasks = [
      new BatchTask({ id: 'T-1', requiredCpu: 2, requiredMemory: 4, executionTime: 2, arrivalTime: 0 }),
      new BatchTask({ id: 'T-2', requiredCpu: 2, requiredMemory: 4, executionTime: 2, arrivalTime: 0 }),
    ];

    const scheduler = new RoundRobinScheduler();
    const assignments = scheduler.schedule(tasks, nodes);
    expect(assignments).toHaveLength(2);
    expect(assignments[0].node.id).toBe('vm-1');
    expect(assignments[1].node.id).toBe('vm-2');
  });

  it('PriorityScheduler dispatches PriorityTask before InteractiveTask and BatchTask', () => {
    const nodes = [new PhysicalServer('ps-1', 'PS 1', 32, 128, 2000, 1.85)];
    const batch = new BatchTask({ id: 'T-B', requiredCpu: 2, requiredMemory: 4, executionTime: 2, arrivalTime: 0 });
    const interactive = new InteractiveTask({ id: 'T-I', requiredCpu: 2, requiredMemory: 4, executionTime: 2, arrivalTime: 0 });
    const priority = new PriorityTask({ id: 'T-P', requiredCpu: 2, requiredMemory: 4, executionTime: 2, arrivalTime: 0 });

    const scheduler = new PriorityScheduler();
    const assignments = scheduler.schedule([batch, interactive, priority], nodes);
    expect(assignments.map((a) => a.task.id)).toEqual(['T-P', 'T-I', 'T-B']);
  });

  it('LeastLoadedScheduler selects the node with lowest CPU utilization', () => {
    const n1 = new VirtualMachine('vm-1', 'VM 1', 8, 32, 500, 0.35);
    const n2 = new VirtualMachine('vm-2', 'VM 2', 8, 32, 500, 0.35);
    n1.assignTask(
      new BatchTask({ id: 'T-0', requiredCpu: 4, requiredMemory: 4, executionTime: 5, arrivalTime: 0 }),
      0
    );

    const incoming = new InteractiveTask({
      id: 'T-1',
      requiredCpu: 2,
      requiredMemory: 4,
      executionTime: 2,
      arrivalTime: 1,
    });

    const scheduler = new LeastLoadedScheduler();
    const assignments = scheduler.schedule([incoming], [n1, n2]);
    expect(assignments[0].node.id).toBe('vm-2');
  });

  it('CostAwareScheduler selects the cheapest eligible node', () => {
    const expensive = new PhysicalServer('ps-1', 'PS 1', 32, 128, 2000, 1.85);
    const cheap = new VirtualMachine('vm-1', 'VM 1', 8, 32, 500, 0.28);

    const task = new BatchTask({
      id: 'T-1',
      requiredCpu: 2,
      requiredMemory: 4,
      executionTime: 2,
      arrivalTime: 0,
    });

    const scheduler = new CostAwareScheduler();
    const assignments = scheduler.schedule([task], [expensive, cheap]);
    expect(assignments[0].node.id).toBe('vm-1');
  });
});

describe('SimulationEngine Singleton', () => {
  it('advances ticks, assigns tasks, and collects metrics', () => {
    const engine = SimulationEngine.getInstance();
    engine.reset();
    const initial = engine.getSnapshot();
    expect(initial.currentTick).toBe(0);
    expect(initial.queuedTasks.length).toBe(5);

    engine.tick();
    const afterTick = engine.getSnapshot();
    expect(afterTick.currentTick).toBe(1);
    expect(afterTick.metricsHistory).toHaveLength(1);
    expect(afterTick.latestMetrics.totalCost).toBeGreaterThan(0);

    engine.reset();
    expect(engine.getSnapshot().currentTick).toBe(0);
  });
});

describe('StrategyEvaluator', () => {
  it('evaluates all 4 strategies on an identical task list and picks a superior strategy', () => {
    const report = StrategyEvaluator.evaluate(
      PRESET_WORKLOADS['mixed-cloud'].tasks,
      'lowest-cost'
    );

    expect(report.results).toHaveLength(4);
    expect(report.winner.compositeScore).toBeGreaterThanOrEqual(
      report.runnerUp.compositeScore
    );
    expect(report.winner.completedTasks).toBe(
      PRESET_WORKLOADS['mixed-cloud'].tasks.length
    );

    const priorityReport = StrategyEvaluator.evaluate(
      PRESET_WORKLOADS['priority-spike'].tasks,
      'priority-sla'
    );
    expect(priorityReport.winner.priorityWaitTimeMs).toBeLessThanOrEqual(
      priorityReport.runnerUp.priorityWaitTimeMs
    );
  });

  it('parses and evaluates a large 500-task CSV file cleanly', () => {
    const csv = generateSampleTasksCsv(500);
    const { tasks, warnings } = parseTasksCsv(csv);

    expect(warnings).toHaveLength(0);
    expect(tasks).toHaveLength(500);

    const report = StrategyEvaluator.evaluate(tasks, 'balanced');
    expect(report.results).toHaveLength(4);
    expect(report.winner.completedTasks).toBe(500);
    expect(report.winner.unscheduledTasks).toBe(0);
  });
});

describe('WorkloadPlaybackEngine', () => {
  it('replays an uploaded workload step-by-step to completion', () => {
    const tasks = PRESET_WORKLOADS['mixed-cloud'].tasks;
    const playback = new WorkloadPlaybackEngine(tasks, 'priority');

    expect(playback.getSnapshot().totalTasks).toBe(tasks.length);
    expect(playback.isFinished()).toBe(false);

    let guard = 0;
    while (!playback.isFinished() && guard < 200) {
      playback.tick();
      guard += 1;
    }

    const finalSnap = playback.getSnapshot();
    expect(finalSnap.isFinished).toBe(true);
    expect(finalSnap.completedCount).toBe(tasks.length);
    expect(finalSnap.latestMetrics.totalCost).toBeGreaterThan(0);

    playback.reset();
    expect(playback.getSnapshot().currentTick).toBe(0);
    expect(playback.getSnapshot().completedCount).toBe(0);
    playback.destroy();
  });
});
