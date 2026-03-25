import { create } from 'zustand';
import type { PlanetData } from '../data/planets';
import type { ProbeMeta } from '../data/probesMeta';

export type FocusTarget =
  | { type: 'planet'; data: PlanetData; index: number }
  | { type: 'probe'; data: ProbeMeta; index: number }
  | null;

interface SpaceStore {
  // Time — only UI-driven state here. Actual sim time lives in utils/simTime.ts
  timeSpeed: number;
  isPaused: boolean;
  setTimeSpeed: (speed: number) => void;
  togglePause: () => void;

  // Camera / focus
  focusTarget: FocusTarget;
  setFocusTarget: (target: FocusTarget) => void;
  clearFocus: () => void;

  // Layers
  showSatellites: boolean;
  showProbes: boolean;
  toggleSatellites: () => void;
  toggleProbes: () => void;

  // Tooltip
  tooltip: { text: string; x: number; y: number } | null;
  setTooltip: (t: { text: string; x: number; y: number } | null) => void;

  // Loading
  isLoaded: boolean;
  setLoaded: () => void;
}

export const useStore = create<SpaceStore>((set) => ({
  timeSpeed: 1,
  isPaused: false,
  setTimeSpeed: (speed) => set({ timeSpeed: speed }),
  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

  focusTarget: null,
  setFocusTarget: (target) => set({ focusTarget: target }),
  clearFocus: () => set({ focusTarget: null }),

  showSatellites: true,
  showProbes: true,
  toggleSatellites: () => set((s) => ({ showSatellites: !s.showSatellites })),
  toggleProbes: () => set((s) => ({ showProbes: !s.showProbes })),

  tooltip: null,
  setTooltip: (t) => set({ tooltip: t }),

  isLoaded: false,
  setLoaded: () => set({ isLoaded: true }),
}));
