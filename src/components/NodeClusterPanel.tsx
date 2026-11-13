import React from 'react';
import { NodeSnapshot, TaskType } from '../domain/Snapshots';

interface NodeClusterPanelProps {
  nodes: NodeSnapshot[];
  strategyName: string;
}

const TASK_PILL: Record<TaskType, string> = {
  Priority: 'bg-orange-50 text-[#b5370e] border-orange-200',
  Interactive: 'bg-teal-50 text-[#0f766e] border-teal-200',
  Batch: 'bg-amber-50 text-[#b45309] border-amber-200',
};

function getCpuBarColor(pct: number): string {
  if (pct >= 85) return 'bg-[#d94e1f]';
  if (pct >= 55) return 'bg-[#d97706]';
  return 'bg-[#0d9488]';
}

export const NodeClusterPanel: React.FC<NodeClusterPanelProps> = ({
  nodes,
  strategyName,
}) => {
  return (
    <section className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Compute Nodes</h2>
          <p className="text-xs text-gray-500">
            Scheduled via <span className="font-medium text-gray-800">{strategyName}</span>
          </p>
        </div>
        <span className="text-xs text-gray-500">{nodes.length} nodes</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {nodes.map((node) => {
          const isPhysical = node.nodeType === 'PhysicalServer';
          return (
            <div
              key={node.id}
              className="flex flex-col justify-between rounded-xl border border-gray-200 bg-gray-50/50 p-3.5"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-900">
                      {node.name}
                    </h3>
                    <span className="text-[11px] text-gray-500">
                      {isPhysical ? 'Physical' : 'VM'} · {node.id}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-gray-700">
                    ${node.costPerTick.toFixed(2)}/t
                  </span>
                </div>

                {/* Primary CPU Utilization Bar */}
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-gray-500">CPU</span>
                    <span className="font-mono font-medium text-gray-900">
                      {node.cpuAllocated}/{node.cpuCapacity} vCPU (
                      {node.cpuUtilization.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${getCpuBarColor(
                        node.cpuUtilization
                      )}`}
                      style={{ width: `${Math.min(100, node.cpuUtilization)}%` }}
                    />
                  </div>
                </div>

                {/* Simple Memory Readout */}
                <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                  <span>Memory</span>
                  <span className="font-mono">
                    {node.memoryAllocated}/{node.memoryCapacity} GB
                  </span>
                </div>
              </div>

              {/* Running Tasks */}
              <div className="mt-3 border-t border-gray-200/80 pt-2.5">
                {node.runningTasks.length === 0 ? (
                  <span className="text-[11px] text-gray-400">Idle</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {node.runningTasks.map((task) => (
                      <span
                        key={task.id}
                        className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                          TASK_PILL[task.type]
                        }`}
                      >
                        {task.id} ({task.remainingTime}t)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
