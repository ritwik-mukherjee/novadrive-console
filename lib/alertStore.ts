"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { caseFeedEvents, processFeed, type FeedEvent } from "./alertFeed";
import { dataset } from "./data";
import { useModel } from "./weights";

export type CardStatus = "New" | "Acknowledged" | "In progress" | "Closed";
export const CARD_STATUSES: CardStatus[] = ["New", "Acknowledged", "In progress", "Closed"];

interface AlertState {
  simulated: FeedEvent[];
  choices: Record<string, string>;
  statuses: Record<string, CardStatus>;
  selected: string | null;
  addEvent: (e: Omit<FeedEvent, "id" | "simulated">) => string;
  choose: (eventId: string, key: string | null) => void;
  setStatus: (eventId: string, s: CardStatus) => void;
  select: (eventId: string | null) => void;
  clearSimulated: () => void;
}

/** Local session state only (PRD: no write-back). */
export const useAlertState = create<AlertState>((set, get) => ({
  simulated: [],
  choices: {},
  statuses: {},
  selected: "EV-001",
  addEvent: (e) => {
    const id = `SIM-${String(get().simulated.length + 1).padStart(3, "0")}`;
    set((s) => ({ simulated: [...s.simulated, { ...e, id, simulated: true }], selected: id }));
    return id;
  },
  choose: (eventId, key) =>
    set((s) => {
      const choices = { ...s.choices };
      if (key) choices[eventId] = key;
      else delete choices[eventId];
      return { choices };
    }),
  setStatus: (eventId, st) => set((s) => ({ statuses: { ...s.statuses, [eventId]: st } })),
  select: (eventId) => set({ selected: eventId }),
  clearSimulated: () => set({ simulated: [], selected: "EV-001" }),
}));

const CASE_EVENTS = caseFeedEvents(dataset);

/** The processed feed (case events + anything typed in), at the live weights. */
export function useAlertFeed() {
  const { model } = useModel();
  const simulated = useAlertState((s) => s.simulated);
  const choices = useAlertState((s) => s.choices);
  return useMemo(() => {
    const events = [...CASE_EVENTS, ...simulated].map((e) => ({ ...e, choice: choices[e.id] ?? null }));
    return processFeed(events, dataset, model);
  }, [model, simulated, choices]);
}
