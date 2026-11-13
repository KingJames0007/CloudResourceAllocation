import React from 'react';
import { MetricDataPoint } from '../wasmBridge';

interface MetricsPanelProps {
  latest: MetricDataPoint;
  history: MetricDataPoint[];
}

interface SparklineCardProps {
  label: string;
  value: string;
  subText: string;
  data: number[];
  stroke: string;
  yMaxOverride?: number;
}

const SparklineCard: React.FC<SparklineCardProps> = ({
  label,
  value,
  subText,
  data,
  stroke,
  yMaxOverride,
}) => {
  const width = 260;
  const height = 44;
  const pad = 4;
  const maxVal = yMaxOverride ?? Math.max(1, ...data) * 1.1;

  const points = data.map((val, idx) => {
    const x =
      data.length <= 1
        ? width / 2
        : pad + (idx / (data.length - 1)) * (width - pad * 2);
    const ratio = Math.min(1, Math.max(0, val / Math.max(0.0001, maxVal)));
    const y = height - pad - ratio * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <span className="text-[11px] text-gray-400">{subText}</span>
      </div>

      <div className="mt-1 font-mono text-2xl font-bold tracking-tight text-gray-900">
        {value}
      </div>

      <div className="mt-2 h-11 w-full">
        {points.length > 1 ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full w-full overflow-visible"
            preserveAspectRatio="none"
          >
            <polyline
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points.join(' ')}
            />
          </svg>
        ) : (
          <div className="flex h-full items-center text-[11px] text-gray-300">
            Press Play or Step to record telemetry
          </div>
        )}
      </div>
    </div>
  );
};

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  latest,
  history,
}) => {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <SparklineCard
        label="Overall CPU Utilization"
        value={`${latest.cpuUtilization.toFixed(1)}%`}
        subText={`Memory ${latest.memoryUtilization.toFixed(0)}%`}
        data={history.map((h) => h.cpuUtilization)}
        stroke="#d94e1f"
        yMaxOverride={100}
      />

      <SparklineCard
        label="Average Wait Time"
        value={`${latest.averageWaitTimeMs.toLocaleString()} ms`}
        subText={`${latest.completedCount} completed`}
        data={history.map((h) => h.averageWaitTimeMs)}
        stroke="#0d9488"
      />

      <SparklineCard
        label="Total Cost Accrued"
        value={`$${latest.totalCost.toFixed(2)}`}
        subText={`+$${latest.tickCost.toFixed(2)} / tick`}
        data={history.map((h) => h.totalCost)}
        stroke="#111827"
      />
    </section>
  );
};
