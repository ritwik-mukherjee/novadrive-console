"use client";

import { create } from "zustand";
import type { ProductId } from "./types";

export type TierFilter = "all" | 1 | 2 | 3;

interface FilterState {
  product: ProductId | "all";
  zone: string | "all";
  tier: TierFilter;
  setProduct: (p: ProductId | "all") => void;
  setZone: (z: string | "all") => void;
  setTier: (t: TierFilter) => void;
}

/** Global filters shown in the header; every screen reads them. */
export const useFilters = create<FilterState>((set) => ({
  product: "all",
  zone: "all",
  tier: "all",
  setProduct: (product) => set({ product }),
  setZone: (zone) => set({ zone }),
  setTier: (tier) => set({ tier }),
}));

/** Does a scored node pass the global header filters? */
export function passesFilters(
  n: { exposure: Record<ProductId, number>; input: { zone: string; tier: number } },
  f: Pick<FilterState, "product" | "zone" | "tier">,
): boolean {
  if (f.product !== "all" && !(n.exposure[f.product] > 0)) return false;
  if (f.zone !== "all" && !n.input.zone.split("/").includes(f.zone)) return false;
  if (f.tier !== "all" && n.input.tier !== f.tier) return false;
  return true;
}
