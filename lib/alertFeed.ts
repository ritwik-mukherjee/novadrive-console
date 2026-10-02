/**
 * Event feed processing: every event (case feed or typed in by a user) goes
 * through the same five steps: de-dup -> freshness -> resolution -> network
 * match -> score. Pure; the React hook lives in lib/alertStore.ts.
 */
import { scoreAlert, type AlertResult, type AlertScoreInput, type Model } from "./engine";
import { matchEvent, revenueAtStake, type MatchResult } from "./matcher";
import { fmtNum } from "./format";
import type { Dataset, EventInput } from "./types";

export interface FeedEvent {
  id: string;
  published: string;
  effective: string;
  title: string;
  text: string;
  sourceFamily: string;
  sourceType: string | null;
  severityOverride?: number | null;
  choice?: string | null;
  simulated: boolean;
}

export type StepStatus = "pass" | "stop" | "warn" | "ask" | "skip";
export interface PipelineStep {
  n: number;
  name: string;
  status: StepStatus;
  text: string;
}

export interface AlertCard {
  why: string;
  nextAction: string;
  verification: string;
  owner: string;
  escalation: string;
}

export interface FeedItem {
  event: FeedEvent;
  match: MatchResult;
  alert: AlertResult;
  steps: PipelineStep[];
  card: AlertCard;
  revenueAtStake: number;
  provisional: boolean;
  caseInput: EventInput | null;
}

export const caseFeedEvents = (data: Dataset): FeedEvent[] =>
  data.events.map((e) => ({
    id: e.id,
    published: e.published,
    effective: e.effective,
    title: e.title,
    text: e.detail ?? "",
    sourceFamily: e.sourceFamily,
    sourceType: e.sourceType,
    simulated: false,
  }));

const short = (n: string) => n.replace(/ Ltd\.?$/, "");

export function processFeed(events: FeedEvent[], data: Dataset, model: Model): FeedItem[] {
  const prior: AlertScoreInput[] = [];
  const items: FeedItem[] = [];
  for (const ev of events) {
    const match = matchEvent(
      { title: ev.title, text: ev.text, sourceType: ev.sourceType, severityOverride: ev.severityOverride, choice: ev.choice },
      data,
      model,
    );
    const input: AlertScoreInput = {
      id: ev.id,
      published: ev.published,
      effective: ev.effective,
      sourceFamily: ev.sourceFamily,
      title: ev.title,
      primaryNode: match.primaryNode,
      severity: match.S,
      credibility: match.C,
      match: match.M,
      exposureOverride: match.exposureOverride,
    };
    const alert = scoreAlert(input, prior, model.byId, data.assumptions);
    prior.push(input);
    const caseInput = ev.simulated ? null : (data.events.find((e) => e.id === ev.id) ?? null);
    const provisional = Boolean(match.ambiguous && !match.chosen);
    items.push({
      event: ev,
      match,
      alert,
      steps: buildSteps(ev, match, alert, data),
      card: caseInput ? fromWorkbook(caseInput) : templateCard(match, alert, model, data),
      revenueAtStake: revenueAtStake(match, model, data),
      provisional,
      caseInput,
    });
  }
  return items;
}

function buildSteps(ev: FeedEvent, m: MatchResult, a: AlertResult, data: Dataset): PipelineStep[] {
  const steps: PipelineStep[] = [];
  steps.push(
    a.duplicateOf
      ? {
          n: 1,
          name: "De-duplicate",
          status: "stop",
          text: ev.sourceFamily
            ? `Same source family ${ev.sourceFamily} as ${a.duplicateOf}: merged, adds no independent evidence.`
            : `No source family; title matches ${a.duplicateOf} (similarity > 0.85, same effective date): merged.`,
        }
      : {
          n: 1,
          name: "De-duplicate",
          status: "pass",
          text: ev.sourceFamily ? `New source family ${ev.sourceFamily}.` : "No source family given; no near-identical title on the same date.",
        },
  );
  const stopped = Boolean(a.duplicateOf);
  steps.push(
    stopped
      ? { n: 2, name: "Freshness", status: "skip", text: "Not reached." }
      : a.stale
        ? {
            n: 2,
            name: "Freshness",
            status: "stop",
            text: `Effective ${ev.effective}, published ${a.ageDays} days later (limit ${data.assumptions.alert.staleDays}): stale, suppressed.`,
          }
        : {
            n: 2,
            name: "Freshness",
            status: "pass",
            text: `Published ${a.ageDays} day${a.ageDays === 1 ? "" : "s"} after the effective date (limit ${data.assumptions.alert.staleDays}).`,
          },
  );
  const halted = stopped || a.stale;
  const resStatus: StepStatus = m.ambiguous && !m.chosen ? "ask" : m.kind === "wrong-entity" ? "stop" : "pass";
  steps.push({ n: 3, name: "Entity & facility", status: halted ? "skip" : resStatus, text: halted ? "Not reached." : m.resolution });
  const netStatus: StepStatus =
    m.kind === "wrong-entity" ? "stop" : m.kind === "unresolved" || m.kind === "non-production-zone" || m.M < 0.5 ? "warn" : "pass";
  steps.push({ n: 4, name: "Network / zone match", status: halted ? "skip" : netStatus, text: halted ? "Not reached." : m.networkMatch });
  steps.push({
    n: 5,
    name: "Score",
    status: halted ? "skip" : a.level === "HIGH" || a.level === "MEDIUM" ? "pass" : "warn",
    text: halted
      ? "Not scored."
      : `100 × S ${fmtNum(a.S, 1)} × C ${fmtNum(a.C, 1)} × M ${fmtNum(a.M, 1)} × E ${fmtNum(a.E, 2)} × vuln ${fmtNum(a.vulnFactor, 3)} = ${fmtNum(a.score, 1)} → ${a.levelLabel}`,
  });
  return steps;
}

function fromWorkbook(e: EventInput): AlertCard {
  return { why: e.why, nextAction: e.nextAction, verification: e.verification, owner: e.owner, escalation: e.escalation };
}

/** Card text for a typed-in event, generated from the matched node's facts. */
function templateCard(m: MatchResult, a: AlertResult, model: Model, data: Dataset): AlertCard {
  const total = data.assumptions.totalRevenue;
  const primary = model.byId.get(m.primaryNode ?? "");
  if (a.level === "MERGED") {
    return { why: "Counting a republication twice would double the apparent signal strength.", nextAction: "None: merged into the original alert.", verification: "—", owner: "Risk analyst", escalation: "—" };
  }
  if (a.level === "SUPPRESS – stale") {
    return { why: "Old news recycled as current would waste management attention.", nextAction: "Suppress; down-weight the source in future scoring.", verification: "—", owner: "Risk analyst", escalation: "A new, dated report of the same event." };
  }
  if (m.kind === "wrong-entity") {
    return {
      why: "A keyword match would have raised a false alert on a NovaDrive supplier; entity resolution prevents it.",
      nextAction: "Log only. One-line check with procurement that no PO or booking runs through this entity.",
      verification: "—",
      owner: "Risk analyst",
      escalation: "Evidence of any NovaDrive or Tier-1 transaction with this entity.",
    };
  }
  if (m.kind === "own-plant") {
    const share = m.exposureOverride ?? 0;
    return {
      why: `This concerns NovaDrive's own plant: about ${Math.round(share * 100)}% of revenue (USD ${fmtNum((share * total) / 52, 1)}m / week) is assembled there. It is an operations incident, not a supplier failure.`,
      nextAction: "24h: plant manager confirms scope and expected duration; 72h: decide whether to shift volume to the other plants.",
      verification: "Which lines are affected; finished-goods cover; whether the event is at our plant or at Harbor Freight's site of the same name.",
      owner: "COO + plant manager",
      escalation: "Stoppage longer than 1 week or customer deliveries at risk → CRITICAL.",
    };
  }
  if (m.kind === "unresolved") {
    return {
      why: "Unknown is not the same as irrelevant: we cannot rule out that this hits a single-source lane or site.",
      nextAction: "Ask forwarders and Tier-1s which bookings or sites are involved; check inbound buffer.",
      verification: "Location-to-zone mapping; which lanes or suppliers use it (data gap).",
      owner: "Logistics lead",
      escalation: "A mapped single-source site or lane is confirmed affected → MEDIUM or higher.",
    };
  }
  if (!primary) {
    return {
      why: "The location holds no mapped production node.",
      nextAction: "Log; confirm no WIP or finished stock sits at the affected sites.",
      verification: "Inventory location at logistics/admin sites in the zone.",
      owner: "Risk analyst",
      escalation: "Any production site found in the area.",
    };
  }
  const routeVia =
    primary.input.tier === 1
      ? `${short(primary.name)} directly`
      : `its Tier-1 customers (${downstreamTier1(primary.id, data)
          .map((id) => short(model.byId.get(id)?.name ?? id))
          .join(", ")})`;
  const nodes = m.matchedNodes.map((id) => short(model.byId.get(id)?.name ?? id));
  const nonProd = m.M < 0.5;
  return {
    why: nonProd
      ? `Right company, but the facility named is not a production site: ${short(primary.name)}'s supply is not directly affected.`
      : `${m.kind === "zone" ? `${nodes.length} mapped production nodes sit in ${m.zone} (${nodes.join(", ")}). ` : ""}${short(primary.name)} is ${primary.band} (#${primary.rank}); ${Math.round(primary.share * 100)}% of revenue (USD ${fmtNum(primary.weekly, 1)}m / week) depends on it and recovery takes ~${primary.input.ttrWeeks} weeks (${primary.input.ttrBasis}).`,
    nextAction: nonProd
      ? "Update supplier master data; confirm production sites are unaffected."
      : `24h: confirm status of ${m.siteId ?? `sites in ${m.zone}`} through ${routeVia}; get weeks of inventory cover on hand and in transit. 72h: request pull-forward and pre-issue RFIs to shortlisted alternates.`,
    verification: `A second independent source; the exact site and lines affected; inventory cover at ${primary.input.tier === 1 ? "the supplier" : "the Tier-1s"}.`,
    owner: a.level === "HIGH" ? "CRO + category lead" : "Category lead",
    escalation: "Damage or shutdown confirmed, or a second independent source → raise one level and activate alternates.",
  };
}

function downstreamTier1(nodeId: string, data: Dataset): string[] {
  const out = new Set<string>();
  let frontier = [nodeId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const l of data.links) {
        if (l.supplierId !== id || !l.include || !l.customerId) continue;
        if (l.customerId === "NOVADRIVE") continue;
        const cust = data.nodes.find((n) => n.id === l.customerId);
        if (cust?.tier === 1) out.add(cust.id);
        else next.push(l.customerId);
      }
    }
    frontier = next;
  }
  return [...out];
}
