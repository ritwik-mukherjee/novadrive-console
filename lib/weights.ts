"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { dataset } from "./data";
import { applyScenario, buildModel, normaliseGroup, runSensitivity, type Model } from "./engine";
import type { Weights } from "./types";

const BASE: Weights = dataset.assumptions.weights;

interface WeightState {
  /** Slider positions. Pillar and impact groups are auto-normalised before scoring. */
  raw: Weights;
  setVuln: (k: keyof Weights["vuln"], v: number) => void;
  setImpact: (k: keyof Weights["impact"], v: number) => void;
  setOverlay: (v: number) => void;
  setPercentile: (v: number) => void;
  applyScenario: (id: string) => void;
  reset: () => void;
}

export const useWeights = create<WeightState>((set) => ({
  raw: structuredClone(BASE),
  setVuln: (k, v) => set((s) => ({ raw: { ...s.raw, vuln: { ...s.raw.vuln, [k]: v } } })),
  setImpact: (k, v) => set((s) => ({ raw: { ...s.raw, impact: { ...s.raw.impact, [k]: v } } })),
  setOverlay: (v) => set((s) => ({ raw: { ...s.raw, overlayPoints: v } })),
  setPercentile: (v) => set((s) => ({ raw: { ...s.raw, imputePercentile: v } })),
  applyScenario: (id) => {
    const sc = dataset.scenarios.find((x) => x.id === id);
    if (sc) set({ raw: applyScenario(BASE, sc) });
  },
  reset: () => set({ raw: structuredClone(BASE) }),
}));

export interface NormalisedWeights {
  weights: Weights;
  vulnRawSum: number;
  impactRawSum: number;
}

export function normaliseWeights(raw: Weights): NormalisedWeights {
  const v = normaliseGroup(raw.vuln);
  const i = normaliseGroup(raw.impact);
  return { weights: { ...raw, vuln: v.weights, impact: i.weights }, vulnRawSum: v.rawSum, impactRawSum: i.rawSum };
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
export function sameWeights(a: Weights, b: Weights): boolean {
  return (
    (Object.keys(a.vuln) as (keyof Weights["vuln"])[]).every((k) => close(a.vuln[k], b.vuln[k])) &&
    (Object.keys(a.impact) as (keyof Weights["impact"])[]).every((k) => close(a.impact[k], b.impact[k])) &&
    close(a.overlayPoints, b.overlayPoints) &&
    close(a.imputePercentile, b.imputePercentile)
  );
}

/** Model at the workbook's base weights (for rank-change arrows). */
export const baseModel: Model = buildModel(dataset);

/** Live model at the current slider weights. */
export function useModel() {
  const raw = useWeights((s) => s.raw);
  return useMemo(() => {
    const norm = normaliseWeights(raw);
    const model = buildModel(dataset, norm.weights);
    const sensitivity = runSensitivity(dataset, dataset.scenarios, norm.weights);
    const activeScenario =
      dataset.scenarios.find((s) => sameWeights(normaliseWeights(applyScenario(BASE, s)).weights, norm.weights))?.id ?? null;
    const isBase = sameWeights(norm.weights, BASE);
    return { ...norm, model, sensitivity, activeScenario, isBase };
  }, [raw]);
}
