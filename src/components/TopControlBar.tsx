import React from 'react';
import { Activity } from 'lucide-react';

export const TopControlBar: React.FC = () => {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-gray-900">
              Stratos CloudSim
            </h1>
            <p className="text-xs text-gray-500">
              Compare cloud scheduling strategies on your CSV workload &amp; simulate each one
            </p>
          </div>
        </div>

        <span className="hidden rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-600 sm:inline-block">
          6-Node Cluster · 2 Physical · 4 VMs
        </span>
      </div>
    </header>
  );
};
