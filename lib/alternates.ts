/**
 * Alternate-supplier helpers: which curated candidates belong to which flagged
 * node, route classification, and CSV export. Fitment and risk stay separate.
 */
import { fitment, recommendAlternate, type Model } from "./engine";
import { findMentions } from "./matcher";
import type { Alternate, Component, CriterionScores, Dataset } from "./types";

export type Route = "same-tier" | "sub-tier" | "platform";
export const ROUTE_LABELS: Record<Route, string> = {
  "same-tier": "Same-tier swap",
  "sub-tier": "Second source one tier down, via the Tier-1",
  platform: "Platform redesign",
};

export function classifyRoute(route: string): Route {
  const r = route.toLowerCase();
  if (r.includes("platform")) return "platform";
  if (r.includes("tier-2") || r.includes(" via ") || r.includes("second-source to")) return "sub-tier";
  return "same-tier";
}

/** Scored nodes named in a candidate's trigger ("IonPeak dies (EV-001, Critical)" → ORG-439). */
export function nodesForAlternate(alt: Alternate, data: Dataset, model: Model): string[] {
  const head = alt.trigger.split("(")[0];
  const ids = findMentions(head, data).flatMap((m) => m.entityIds);
  return [...new Set(ids.filter((id) => model.byId.has(id)))];
}

/** Components a node feeds (Tier-1: its own; upstream: the Tier-1 components downstream of it). */
export function componentsForNode(nodeId: string, data: Dataset): Component[] {
  const ids = new Set<string>();
  const members = data.links.filter((l) => l.type === "Ownership" && l.supplierId === nodeId).map((l) => l.customerId!);
  let frontier = [nodeId, ...members];
  const seen = new Set<string>();
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      for (const l of data.links) {
        if (l.supplierId !== id || !l.include) continue;
        if (l.supplierTier === 1) ids.add(l.input);
        else if (l.customerId) next.push(l.customerId);
      }
    }
    frontier = next;
  }
  return data.components.filter((c) => ids.has(c.id));
}

export interface CandidateView {
  alt: Alternate;
  scores: CriterionScores;
  fit: number;
  notIndependent: boolean;
  recommendation: string;
  route: Route;
  nodes: string[];
  edited: boolean;
}

export function viewCandidate(
  alt: Alternate,
  data: Dataset,
  model: Model,
  edits: Record<string, CriterionScores>,
  dependent: Record<string, boolean>,
): CandidateView {
  const key = String(alt.n);
  const scores = edits[key] ?? alt.scores;
  const fit = fitment(scores, data.assumptions);
  const notIndependent = Boolean(dependent[key]);
  return {
    alt,
    scores,
    fit,
    notIndependent,
    recommendation: recommendAlternate(fit, alt.risk, data.assumptions, notIndependent),
    route: classifyRoute(alt.route),
    nodes: nodesForAlternate(alt, data, model),
    edited: Boolean(edits[key]),
  };
}

const CSV_COLS: [string, (c: CandidateView) => string | number][] = [
  ["#", (c) => c.alt.n],
  ["Flagged node / trigger", (c) => c.alt.trigger],
  ["Component", (c) => c.alt.component],
  ["Route", (c) => c.alt.route],
  ["Route type", (c) => ROUTE_LABELS[c.route]],
  ["Candidate", (c) => c.alt.candidate],
  ["Product line & capability evidence", (c) => c.alt.evidence],
  ["Footprint", (c) => c.alt.footprint],
  ["Source", (c) => c.alt.source],
  ["Source date", (c) => c.alt.sourceDate],
  ["Technical", (c) => c.scores.technical],
  ["Application", (c) => c.scores.application],
  ["Footprint & independence", (c) => c.scores.footprint],
  ["Scale", (c) => c.scores.scale],
  ["Presence & quality", (c) => c.scores.presence],
  ["Qualification ease", (c) => c.scores.qualEase],
  ["Fitment (0-100)", (c) => c.fit.toFixed(1)],
  ["Scores edited in console", (c) => (c.edited ? "yes" : "no")],
  ["Risk screen", (c) => c.alt.risk],
  ["Risk note", (c) => c.alt.riskNote],
  ["Uses the failed node?", (c) => (c.notIndependent ? "YES – not independent" : "no")],
  ["Recommendation", (c) => c.recommendation],
  ["What must still be validated", (c) => c.alt.validate],
];

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: CandidateView[], meta: string): string {
  const lines = [`# ${meta}`, CSV_COLS.map(([h]) => esc(h)).join(",")];
  for (const r of rows) lines.push(CSV_COLS.map(([, f]) => esc(f(r))).join(","));
  return lines.join("\r\n");
}
