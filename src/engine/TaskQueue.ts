import { BatchTask, InteractiveTask, PriorityTask, Task } from '../domain/Task';

export class TaskQueue {
  private queue: Task[] = [];
  private sequence = 1;

  public enqueue(task: Task): void {
    this.queue.push(task);
  }

  public removeTasks(taskIds: Set<string>): void {
    this.queue = this.queue.filter((t) => !taskIds.has(t.id));
  }

  public getTasks(): Task[] {
    return [...this.queue];
  }

  public size(): number {
    return this.queue.length;
  }

  /**
   * Generates incoming tasks based on arrivalRate (tasks per tick, e.g., 0.5 to 4.0).
   */
  public generateTasks(currentTick: number, arrivalRate: number): Task[] {
    const whole = Math.floor(arrivalRate);
    const fractional = arrivalRate - whole;
    const count = whole + (Math.random() < fractional ? 1 : 0);

    const created: Task[] = [];
    for (let i = 0; i < count; i++) {
      const task = this.createRandomTask(currentTick);
      this.enqueue(task);
      created.push(task);
    }
    return created;
  }

  public createRandomTask(currentTick: number): Task {
    const id = `TSK-${String(this.sequence++).padStart(4, '0')}`;
    const roll = Math.random();

    if (roll < 0.38) {
      // Batch: heavier memory/duration, low priority
      return new BatchTask({
        id,
        requiredCpu: this.randomInt(2, 6),
        requiredMemory: this.randomInt(6, 20),
        executionTime: this.randomInt(5, 11),
        arrivalTime: currentTick,
      });
    }

    if (roll < 0.76) {
      // Interactive: balanced resource footprint, medium priority
      return new InteractiveTask({
        id,
        requiredCpu: this.randomInt(1, 4),
        requiredMemory: this.randomInt(3, 12),
        executionTime: this.randomInt(3, 7),
        arrivalTime: currentTick,
      });
    }

    // Priority: latency-sensitive, high priority
    return new PriorityTask({
      id,
      requiredCpu: this.randomInt(2, 5),
      requiredMemory: this.randomInt(4, 14),
      executionTime: this.randomInt(2, 5),
      arrivalTime: currentTick,
    });
  }

  public reset(): void {
    this.queue = [];
    this.sequence = 1;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
