import { create } from 'zustand';
import type { PlanetData } from '../data/planets';
import type { ProbeMeta } from '../data/probesMeta';

export type FocusTarget =
  | { type: 'planet'; data: PlanetData; index: number }
  | { type: 'probe'; data: ProbeMeta; index: number }
  | null;

interface SpaceStore {
  // Time simulation
  simulationTime: number;
  timeSpeed: number;
  isPaused: boolean;
  setTimeSpeed: (speed: number) => void;
  togglePause: () => void;
  advanceTime: (dt: number) => void;

  // Camera / focus
  focusTarget: FocusTarget;
  setFocusTarget: (target: FocusTarget) => void;
  clearFocus: () => void;

  // Layers
  showSatellites: boolean;
  showProbes: boolean;
  toggleSatellites: () => void;
  toggleProbes: () => void;

  // Loading
  isLoaded: boolean;
  setLoaded: () => void;
}

export const useStore = create<SpaceStore>((set) => ({
  simulationTime: 0,
  timeSpeed: 1,
  isPaused: false,
  setTimeSpeed: (speed) => set({ timeSpeed: speed }),
  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),
  advanceTime: (dt) =>
    set((s) => ({
      simulationTime: s.isPaused ? s.simulationTime : s.simulationTime + dt * s.timeSpeed * 0.3,
    })),

  focusTarget: null,
  setFocusTarget: (target) => set({ focusTarget: target }),
  clearFocus: () => set({ focusTarget: null }),

  showSatellites: true,
  showProbes: true,
  toggleSatellites: () => set((s) => ({ showSatellites: !s.showSatellites })),
  toggleProbes: () => set((s) => ({ showProbes: !s.showProbes })),

  isLoaded: false,
  setLoaded: () => set({ isLoaded: true }),
}));
