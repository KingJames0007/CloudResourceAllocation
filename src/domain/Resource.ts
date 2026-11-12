export abstract class Resource {
  public readonly capacity: number;
  public allocated: number;
  public readonly unit: string;

  constructor(capacity: number, unit: string, allocated = 0) {
    if (capacity <= 0) {
      throw new Error(`Resource capacity must be positive, received ${capacity}`);
    }
    this.capacity = capacity;
    this.unit = unit;
    this.allocated = Math.max(0, Math.min(allocated, capacity));
  }

  public getAvailable(): number {
    return Math.max(0, Number((this.capacity - this.allocated).toFixed(4)));
  }

  public canAllocate(amount: number): boolean {
    return amount >= 0 && this.allocated + amount <= this.capacity + 1e-9;
  }

  public allocate(amount: number): boolean {
    if (!this.canAllocate(amount)) {
      return false;
    }
    this.allocated = Number(Math.min(this.capacity, this.allocated + amount).toFixed(4));
    return true;
  }

  public release(amount: number): void {
    this.allocated = Number(Math.max(0, this.allocated - amount).toFixed(4));
  }

  public getUtilization(): number {
    return Number(((this.allocated / this.capacity) * 100).toFixed(2));
  }

  public reset(): void {
    this.allocated = 0;
  }
}

export class CPUResource extends Resource {
  constructor(capacity: number, allocated = 0) {
    super(capacity, 'vCPU', allocated);
  }
}

export class MemoryResource extends Resource {
  constructor(capacity: number, allocated = 0) {
    super(capacity, 'GB', allocated);
  }
}

export class StorageResource extends Resource {
  constructor(capacity: number, allocated = 0) {
    super(capacity, 'GB', allocated);
  }
}
