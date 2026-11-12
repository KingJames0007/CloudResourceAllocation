import React from 'react';
import { TaskType } from '../domain/Task';
import { TaskSnapshot } from '../engine/SimulationEngine';

interface TaskQueuePanelProps {
  tasks: TaskSnapshot[];
  lastAssignedCount: number;
}

const DOT_COLOR: Record<TaskType, string> = {
  Priority: 'bg-[#d94e1f]',
  Interactive: 'bg-[#0d9488]',
  Batch: 'bg-[#d97706]',
};

const TEXT_COLOR: Record<TaskType, string> = {
  Priority: 'text-[#b5370e]',
  Interactive: 'text-[#0f766e]',
  Batch: 'text-[#b45309]',
};

export const TaskQueuePanel: React.FC<TaskQueuePanelProps> = ({
  tasks,
  lastAssignedCount,
}) => {
  return (
    <section className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Task Queue</h2>
          <p className="text-xs text-gray-500">
            {tasks.length} waiting
            {lastAssignedCount > 0 ? ` · ${lastAssignedCount} dispatched` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2.5 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#d94e1f]" />
            Priority
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#0d9488]" />
            Interactive
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#d97706]" />
            Batch
          </span>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 divide-y divide-gray-100 overflow-y-auto max-h-[480px]">
        {tasks.length === 0 ? (
          <div className="flex h-36 items-center justify-center text-xs text-gray-400">
            Queue is empty
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-2 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    DOT_COLOR[task.type]
                  }`}
                />
                <span className="font-mono font-semibold text-gray-900">
                  {task.id}
                </span>
                <span className={`font-medium ${TEXT_COLOR[task.type]}`}>
                  {task.type}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-gray-500">
                <span>
                  {task.requiredCpu}c/{task.requiredMemory}G
                </span>
                <span className="text-gray-300">·</span>
                <span>{task.executionTime}t</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
