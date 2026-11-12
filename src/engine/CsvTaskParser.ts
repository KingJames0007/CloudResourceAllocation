import { TaskType } from '../domain/Task';
import { TaskSpec } from './StrategyEvaluator';

export interface CsvParseResult {
  tasks: TaskSpec[];
  warnings: string[];
}

function normalizeTaskType(raw: string): TaskType | null {
  const val = raw.trim().toLowerCase();
  if (val === 'priority' || val === 'high' || val === '3' || val === 'p3') {
    return 'Priority';
  }
  if (val === 'interactive' || val === 'medium' || val === '2' || val === 'p2') {
    return 'Interactive';
  }
  if (val === 'batch' || val === 'low' || val === '1' || val === 'p1') {
    return 'Batch';
  }
  return null;
}

/**
 * Parses a CSV string of tasks.
 * Expected columns: id, type, requiredCpu, requiredMemory, executionTime, arrivalTime
 * (Header row is optional; flexible column names like cpu, memory, duration, arrival are supported.)
 */
export function parseTasksCsv(csvText: string): CsvParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) {
    return { tasks: [], warnings: ['CSV file is empty.'] };
  }

  const tasks: TaskSpec[] = [];
  const warnings: string[] = [];

  // Detect header row
  const firstCols = lines[0].split(',').map((c) => c.trim().toLowerCase());
  const hasHeader =
    firstCols.some((c) => c.includes('cpu') || c.includes('type') || c.includes('arrival'));

  let colIdx = {
    id: 0,
    type: 1,
    cpu: 2,
    memory: 3,
    exec: 4,
    arrival: 5,
  };

  if (hasHeader) {
    const findCol = (keywords: string[], fallback: number) => {
      const idx = firstCols.findIndex((h) => keywords.some((k) => h.includes(k)));
      return idx !== -1 ? idx : fallback;
    };
    colIdx = {
      id: findCol(['id', 'task'], 0),
      type: findCol(['type', 'priority', 'class'], 1),
      cpu: findCol(['cpu', 'vcpu', 'core'], 2),
      memory: findCol(['mem', 'ram'], 3),
      exec: findCol(['exec', 'duration', 'time', 'ticks'], 4),
      arrival: findCol(['arrival', 'start', 'tick'], 5),
    };
  }

  const startLine = hasHeader ? 1 : 0;

  for (let i = startLine; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < 5) {
      if (warnings.length < 10) {
        warnings.push(`Row ${i + 1}: expected at least 5 columns, got ${cols.length}.`);
      }
      continue;
    }

    const id = cols[colIdx.id] || `CSV-${i}`;
    const type = normalizeTaskType(cols[colIdx.type] ?? '') ?? 'Batch';
    const requiredCpu = Number(cols[colIdx.cpu]);
    const requiredMemory = Number(cols[colIdx.memory]);
    const executionTime = Number(cols[colIdx.exec]);
    const arrivalTime =
      cols[colIdx.arrival] !== undefined && cols[colIdx.arrival] !== ''
        ? Number(cols[colIdx.arrival])
        : 0;

    if (
      !Number.isFinite(requiredCpu) ||
      requiredCpu <= 0 ||
      !Number.isFinite(requiredMemory) ||
      requiredMemory <= 0 ||
      !Number.isFinite(executionTime) ||
      executionTime <= 0 ||
      !Number.isFinite(arrivalTime) ||
      arrivalTime < 0
    ) {
      if (warnings.length < 10) {
        warnings.push(`Row ${i + 1} (${id}): invalid numeric resource/timing values.`);
      }
      continue;
    }

    tasks.push({
      id,
      type,
      requiredCpu: Math.min(32, Math.max(1, Math.round(requiredCpu))),
      requiredMemory: Math.min(128, Math.max(1, Math.round(requiredMemory))),
      executionTime: Math.max(1, Math.round(executionTime)),
      arrivalTime: Math.max(0, Math.round(arrivalTime)),
    });
  }

  return { tasks, warnings };
}

/**
 * Generates a realistic large CSV dataset for benchmarking.
 */
export function generateSampleTasksCsv(count = 500): string {
  const rows: string[] = [
    'id,type,requiredCpu,requiredMemory,executionTime,arrivalTime',
  ];

  for (let i = 1; i <= count; i++) {
    const id = `CSV-${String(i).padStart(4, '0')}`;
    const roll = (i * 37) % 100;
    const arrivalTick = Math.floor((i - 1) / 3);

    if (roll < 35) {
      // Batch
      const cpu = 2 + (i % 5);
      const mem = 6 + ((i * 3) % 15);
      const exec = 4 + (i % 7);
      rows.push(`${id},Batch,${cpu},${mem},${exec},${arrivalTick}`);
    } else if (roll < 72) {
      // Interactive
      const cpu = 1 + (i % 4);
      const mem = 3 + ((i * 2) % 10);
      const exec = 2 + (i % 5);
      rows.push(`${id},Interactive,${cpu},${mem},${exec},${arrivalTick}`);
    } else {
      // Priority
      const cpu = 2 + (i % 4);
      const mem = 4 + ((i * 2) % 11);
      const exec = 2 + (i % 4);
      rows.push(`${id},Priority,${cpu},${mem},${exec},${arrivalTick}`);
    }
  }

  return rows.join('\n');
}
