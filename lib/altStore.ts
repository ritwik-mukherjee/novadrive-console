"use client";

import { create } from "zustand";
import type { CriterionScores } from "./types";

/** A candidate returned by the live public-source search (unverified until accepted). */
export interface LiveCandidate {
  id: string;
  nodeId: string;
  component: string;
  legalEntity: string;
  hq: string;
  productLine: string;
  footprint: string;
  evidence: string;
  url: string;
  pageDate: string;
  scores: CriterionScores;
  reasons: Partial<Record<keyof CriterionScores, string>>;
  accepted: boolean;
}

export interface LiveSearchState {
  status: "idle" | "loading" | "done" | "error" | "unconfigured";
  message?: string;
  searchedAt?: string;
  cached?: boolean;
}

interface AltState {
  edits: Record<string, CriterionScores>; // keyed by curated "#n" or live id
  dependent: Record<string, boolean>; // "uses the failed node?"
  live: LiveCandidate[];
  search: Record<string, LiveSearchState>; // by node id
  setScore: (key: string, base: CriterionScores, k: keyof CriterionScores, v: number) => void;
  resetScores: (key: string) => void;
  toggleDependent: (key: string) => void;
  setSearch: (nodeId: string, s: LiveSearchState) => void;
  addLive: (nodeId: string, cands: LiveCandidate[]) => void;
  setAccepted: (id: string, accepted: boolean) => void;
}

export const useAltState = create<AltState>((set) => ({
  edits: {},
  dependent: {},
  live: [],
  search: {},
  setScore: (key, base, k, v) =>
    set((s) => ({ edits: { ...s.edits, [key]: { ...(s.edits[key] ?? base), [k]: Math.max(1, Math.min(5, v)) } } })),
  resetScores: (key) =>
    set((s) => {
      const edits = { ...s.edits };
      delete edits[key];
      return { edits };
    }),
  toggleDependent: (key) => set((s) => ({ dependent: { ...s.dependent, [key]: !s.dependent[key] } })),
  setSearch: (nodeId, st) => set((s) => ({ search: { ...s.search, [nodeId]: st } })),
  addLive: (nodeId, cands) => set((s) => ({ live: [...s.live.filter((c) => c.nodeId !== nodeId), ...cands] })),
  setAccepted: (id, accepted) => set((s) => ({ live: s.live.map((c) => (c.id === id ? { ...c, accepted } : c)) })),
}));
