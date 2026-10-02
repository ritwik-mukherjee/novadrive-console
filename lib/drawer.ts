"use client";

import { create } from "zustand";

export type DrawerTarget =
  | { kind: "node"; id: string }
  | { kind: "link"; id: string }
  | { kind: "event"; id: string }
  | { kind: "candidate"; id: string };

interface DrawerState {
  target: DrawerTarget | null;
  history: DrawerTarget[];
  open: (t: DrawerTarget) => void;
  back: () => void;
  close: () => void;
}

/** One right-hand drawer, opened from any screen on any node, link, event or candidate. */
export const useDrawer = create<DrawerState>((set) => ({
  target: null,
  history: [],
  open: (t) => set((s) => ({ target: t, history: s.target ? [...s.history, s.target] : s.history })),
  back: () =>
    set((s) => {
      const history = [...s.history];
      const prev = history.pop() ?? null;
      return { target: prev, history };
    }),
  close: () => set({ target: null, history: [] }),
}));
