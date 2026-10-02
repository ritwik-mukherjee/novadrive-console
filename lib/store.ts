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
