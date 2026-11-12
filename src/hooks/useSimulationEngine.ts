import { useSyncExternalStore } from 'react';
import { SchedulingStrategyId } from '../domain/SchedulingStrategy';
import { SimulationEngine, SimulationSnapshot } from '../engine/SimulationEngine';

const engine = SimulationEngine.getInstance();

export function useSimulationEngine(): {
  snapshot: SimulationSnapshot;
  start: () => void;
  pause: () => void;
  reset: () => void;
  stepOnce: () => void;
  setStrategy: (id: SchedulingStrategyId) => void;
  setArrivalRate: (rate: number) => void;
  setSimulationSpeed: (speed: number) => void;
  injectBurst: (count?: number) => void;
} {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);

  return {
    snapshot,
    start: () => engine.start(),
    pause: () => engine.pause(),
    reset: () => engine.reset(),
    stepOnce: () => engine.tick(),
    setStrategy: (id) => engine.setStrategy(id),
    setArrivalRate: (rate) => engine.setArrivalRate(rate),
    setSimulationSpeed: (speed) => engine.setSimulationSpeed(speed),
    injectBurst: (count) => engine.injectBurst(count),
  };
}
