import { describe, expect, it } from 'vitest';
import { generateSampleTasksCsv, parseTasksCsv } from '../../engine/CsvTaskParser';

describe('CSV Parser Pipeline', () => {
  it('generates and parses 500-task CSV workloads', () => {
    const csv = generateSampleTasksCsv(500);
    const parsed = parseTasksCsv(csv);
    expect(parsed.tasks).toHaveLength(500);
    expect(parsed.warnings).toHaveLength(0);
  });
});
