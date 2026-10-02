/**
 * NovaDrive scoring engine. Pure functions, no UI dependencies.
 * Reproduces the mother workbook's Scorecard, Concentration, Sensitivity,
 * Alerts, Alternates and Checks tabs. Every constant comes from
 * assumptions.json so the UI can change weights live.
 */
import {
  INDICATOR_KEYS,
  PRODUCT_IDS,
  type Alternate,
  type Assumptions,
  type CriterionScores,
  type Curve,
  type Dataset,
  type EventInput,
  type Grade,
  type IndicatorRow,
  type Indicators,
  type Link,
  type NodeInput,
  type PerProduct,
  type ProductId,
  type Scenario,
  type Weights,
} from "./types";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Piecewise-linear map with clamping, same branch order as the workbook's nested IFs. */
export function piecewise(x: number, curve: Pick<Curve, "x" | "y">): number {
  const { x: xs, y: ys } = curve;
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
  }
  return ys[ys.length - 1];
}

/** Excel PERCENTILE / PERCENTILE.INC. */
export function percentileInc(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/** Excel RANK(x, range) (descending) + COUNTIF(range_above_and_incl, x) - 1: ties broken by order of appearance. */
export function rankDescending(values: number[]): number[] {
  return values.map((v, i) => {
    let higher = 0;
    for (const w of values) if (w > v) higher++;
    let earlierEqual = 0;
    for (let j = 0; j < i; j++) if (values[j] === v) earlierEqual++;
    return higher + 1 + earlierEqual;
  });
}

/**
 * Excel stores and compares doubles at 15 significant digits, so e.g. a fitment of
 * 2.9999999999999996/5*100 is exactly 60 in the workbook. Use before any threshold test.
 */
export const xl = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(15)) : x);

export const GRADE_POINTS: Record<Grade, number> = { A: 3, B: 2, C: 1, D: 0 };
export const gradePoints = (g: Grade | null) => (g ? GRADE_POINTS[g] : 0);

const zero = (): PerProduct => ({ P1: 0, P2: 0, P3: 0 });

export function revenueOf(exposure: PerProduct, a: Assumptions): number {
  return a.products.reduce((s, p) => s + exposure[p.id] * p.revenue, 0);
}

// ---------------------------------------------------------------------------
// Network topology helpers
// ---------------------------------------------------------------------------

export type NodeKind = "tier1" | "group" | "upstream";

/** A scored node with no supply links of its own but ownership links is a group (owner) node. */
export function groupMembers(nodeId: string, links: Link[]): string[] {
  const supplies = links.some((l) => l.supplierId === nodeId && l.supplierTier !== null);
  if (supplies) return [];
  return links.filter((l) => l.supplierId === nodeId && l.type === "Ownership" && l.customerId).map((l) => l.customerId!);
}

export function nodeKind(node: NodeInput, links: Link[]): NodeKind {
  if (groupMembers(node.id, links).length > 0) return "group";
  return node.tier === 1 ? "tier1" : "upstream";
}

/**
 * Exposure propagation, tier by tier (T1 -> T2 -> T3), so no cycles are possible.
 * Tier-1 link exposure = allocation x product flag. Upstream link exposure = the
 * customer's exposure. Node exposure = sum over its included links, capped at 1.
 * Group node = sum of members, capped at 1.
 */
export function computeExposures(nodes: NodeInput[], links: Link[]): Map<string, PerProduct> {
  const exposure = new Map<string, PerProduct>();
  const cap = (e: PerProduct): PerProduct => ({ P1: Math.min(1, e.P1), P2: Math.min(1, e.P2), P3: Math.min(1, e.P3) });

  for (const tier of [1, 2, 3] as const) {
    for (const node of nodes) {
      if (node.tier !== tier || nodeKind(node, links) === "group") continue;
      const sum = zero();
      for (const l of links) {
        if (l.supplierId !== node.id || l.supplierTier !== tier || !l.include) continue;
        for (const p of PRODUCT_IDS) {
          if (tier === 1) sum[p] += (l.allocation ?? 0) * l.productFlags[p];
          else sum[p] += exposure.get(l.customerId ?? "")?.[p] ?? 0;
        }
      }
      exposure.set(node.id, cap(sum));
    }
    if (tier === 1) {
      for (const node of nodes) {
        const members = groupMembers(node.id, links);
        if (members.length === 0) continue;
        const sum = zero();
        for (const m of members) for (const p of PRODUCT_IDS) sum[p] += exposure.get(m)?.[p] ?? 0;
        exposure.set(node.id, cap(sum));
      }
    }
  }
  return exposure;
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

export type Band = "Critical" | "High" | "Elevated" | "Watch";
export type Quadrant = "Act now" | "Protect (structural)" | "Remediate supplier" | "Routine";
export type ConfidenceLabel = "High" | "Medium" | "Low";
export type ActionCode = "VERIFY_FIRST" | "ACT" | "CONFIRM" | "VERIFY_SURVEY" | "PLAN" | "MONITOR";

export const ACTION_LABELS: Record<ActionCode, string> = {
  VERIFY_FIRST: "VERIFY first – urgent sub-tier fact-find",
  ACT: "ACT – mitigate now",
  CONFIRM: "CONFIRM sole-source status, then qualify alternate",
  VERIFY_SURVEY: "VERIFY – add to N-tier survey",
  PLAN: "PLAN – qualify alternate in 90 days",
  MONITOR: "MONITOR – quarterly review",
};

export type ImputableField = "currentRatio" | "netDebtEbitda" | "assuranceGap";
export const IMPUTABLE_LABELS: Record<ImputableField, string> = {
  currentRatio: "Current ratio",
  netDebtEbitda: "Net debt/EBITDA",
  assuranceGap: "Assurance gap",
};

export interface ScoredNode {
  input: NodeInput;
  id: string;
  name: string;
  kind: NodeKind;
  raw: Indicators;
  scores: {
    leverage: number | null; // normalised, before imputation
    liquidity: number | null;
    otdLevel: number;
    otdTrend: number;
    leverageUsed: number;
    liquidityUsed: number;
    assuranceUsed: number;
  };
  imputed: ImputableField[];
  pillars: { financial: number; operational: number; assurance: number; geographic: number; overlay: number };
  /** Weighted contributions to V before the 100 cap (for the waterfall). */
  vContrib: { financial: number; operational: number; assurance: number; geographic: number; overlay: number };
  V: number;
  exposure: PerProduct;
  revenueExposed: number;
  share: number;
  weekly: number;
  rar: number;
  recoveryScore: number;
  centralityScore: number;
  iContrib: { revenue: number; recovery: number; centrality: number };
  I: number;
  priority: number;
  rank: number;
  band: Band;
  quadrant: Quadrant;
  confidence: {
    linkPts: number;
    linkSource: string; // which link set the grade
    indicatorsAvailable: number;
    dataPts: number;
    dependencyPts: number;
    points: number;
    label: ConfidenceLabel;
  };
  action: ActionCode;
  actionLabel: string;
}

export interface ScoreOptions {
  weights?: Weights;
}

function bandFor(raw: number, a: Assumptions): Band {
  const p = xl(raw);
  if (p >= a.bands.critical) return "Critical";
  if (p >= a.bands.high) return "High";
  if (p >= a.bands.elevated) return "Elevated";
  return "Watch";
}

function quadrantFor(I: number, V: number, a: Assumptions): Quadrant {
  const iHigh = xl(I) >= a.quadrant.impactHigh;
  const vHigh = xl(V) >= a.quadrant.vulnHigh;
  if (iHigh && vHigh) return "Act now";
  if (iHigh) return "Protect (structural)";
  if (vHigh) return "Remediate supplier";
  return "Routine";
}

export function recommendAction(band: Band, confidence: ConfidenceLabel, dependencyPts: number): ActionCode {
  if (band === "Critical" || band === "High") {
    if (confidence === "Low") return "VERIFY_FIRST";
    if (band === "Critical" || dependencyPts === 1) return "ACT";
    return "CONFIRM";
  }
  if (band === "Elevated") return confidence === "Low" ? "VERIFY_SURVEY" : "PLAN";
  return "MONITOR";
}

export interface ScoreInputs {
  assumptions: Assumptions;
  nodes: NodeInput[];
  links: Link[];
  indicators: IndicatorRow[];
}

export function scoreNetwork(data: ScoreInputs, opts: ScoreOptions = {}): ScoredNode[] {
  const a = data.assumptions;
  const w = opts.weights ?? a.weights;
  const indicatorById = new Map(data.indicators.map((r) => [r.id, r]));
  const exposures = computeExposures(data.nodes, data.links);

  const rawFor = (id: string): Indicators => {
    const row = indicatorById.get(id);
    if (!row) throw new Error(`No indicators for ${id}`);
    const out = {} as Indicators;
    for (const k of INDICATOR_KEYS) out[k] = row[k];
    return out;
  };

  // Pass 1: normalised scores (needed for peer percentiles)
  const pre = data.nodes.map((n) => {
    const raw = rawFor(n.id);
    return {
      n,
      raw,
      leverage: raw.netDebtEbitda === null ? null : piecewise(raw.netDebtEbitda, a.curves.leverage),
      liquidity: raw.currentRatio === null ? null : piecewise(raw.currentRatio, a.curves.liquidity),
      otdLevel: piecewise(raw.otd3m ?? NaN, a.curves.otdLevel),
      otdTrend: piecewise(raw.otdDelta ?? NaN, a.curves.otdTrend),
    };
  });
  const present = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
  const p = w.imputePercentile;
  const levFill = percentileInc(present(pre.map((x) => x.leverage)), p);
  const liqFill = percentileInc(present(pre.map((x) => x.liquidity)), p);
  const assFill = percentileInc(present(pre.map((x) => x.raw.assuranceGap)), p);

  // Pass 2: V, exposure, I, priority
  const partial = pre.map(({ n, raw, leverage, liquidity, otdLevel, otdTrend }) => {
    const kind = nodeKind(n, data.links);
    const imputed: ImputableField[] = [];
    if (raw.currentRatio === null) imputed.push("currentRatio");
    if (raw.netDebtEbitda === null) imputed.push("netDebtEbitda");
    if (raw.assuranceGap === null) imputed.push("assuranceGap");
    const leverageUsed = leverage ?? levFill;
    const liquidityUsed = liquidity ?? liqFill;
    const assuranceUsed = raw.assuranceGap ?? assFill;

    const financial = leverageUsed * w.finSplit.leverage + liquidityUsed * w.finSplit.liquidity;
    const operational = otdLevel * w.opSplit.level + otdTrend * w.opSplit.trend;
    const geoVals = present([raw.physicalHazard, raw.logisticsFriction, raw.infrastructure]);
    const geographic = geoVals.reduce((s, v) => s + v, 0) / geoVals.length;
    const overlay = n.eventOverlay;
    const vContrib = {
      financial: financial * w.vuln.financial,
      operational: operational * w.vuln.operational,
      assurance: assuranceUsed * w.vuln.assurance,
      geographic: geographic * w.vuln.geographic,
      overlay: overlay * w.overlayPoints,
    };
    const V = Math.min(100, vContrib.financial + vContrib.operational + vContrib.assurance + vContrib.geographic + vContrib.overlay);

    const exposure = exposures.get(n.id) ?? zero();
    const revenueExposed = revenueOf(exposure, a);
    const share = revenueExposed / a.totalRevenue;
    const weekly = revenueExposed / 52;
    const rar = weekly * n.ttrWeeks;
    const recoveryScore = Math.min(100, (n.ttrWeeks / a.ttrCap) * 100);
    const centralityScore = Math.min(100, (n.downstreamT1 / a.centralityMax) * 100);
    const iContrib = {
      revenue: share * 100 * w.impact.revenue,
      recovery: recoveryScore * w.impact.recovery,
      centrality: centralityScore * w.impact.centrality,
    };
    const I = iContrib.revenue + iContrib.recovery + iContrib.centrality;
    const priority = (I * V) / 100;

    // Confidence (separate axis)
    const own = data.links.filter((l) => l.supplierId === n.id);
    const includeLinks = own.filter((l) => l.include);
    const gradeSet = includeLinks.length > 0 ? includeLinks : own.filter((l) => l.status !== "Rejected");
    const best = gradeSet.reduce<Link | null>((b, l) => (b === null || gradePoints(l.grade) > gradePoints(b.grade) ? l : b), null);
    const linkPts = best ? gradePoints(best.grade) : 0;
    const linkSource = best
      ? `${best.id} (${best.type}, grade ${best.grade ?? "—"})${includeLinks.length === 0 ? " – group node: graded on its ownership evidence" : ""}`
      : "no link";
    const indicatorsAvailable = INDICATOR_KEYS.filter((k) => raw[k] !== null).length;
    const dataPts = indicatorsAvailable >= 8 ? 2 : indicatorsAvailable >= 6 ? 1 : 0;
    const dependencyPts = n.tier === 1 || n.dependencyStatus.startsWith("Confirmed") ? 1 : 0;
    const points = linkPts + dataPts + dependencyPts;
    const label: ConfidenceLabel = points >= a.confidence.high ? "High" : points >= a.confidence.medium ? "Medium" : "Low";

    const band = bandFor(priority, a);
    const action = recommendAction(band, label, dependencyPts);
    return {
      input: n,
      id: n.id,
      name: n.name,
      kind,
      raw,
      scores: { leverage, liquidity, otdLevel, otdTrend, leverageUsed, liquidityUsed, assuranceUsed },
      imputed,
      pillars: { financial, operational, assurance: assuranceUsed, geographic, overlay },
      vContrib,
      V,
      exposure,
      revenueExposed,
      share,
      weekly,
      rar,
      recoveryScore,
      centralityScore,
      iContrib,
      I,
      priority,
      rank: 0,
      band,
      quadrant: quadrantFor(I, V, a),
      confidence: { linkPts, linkSource, indicatorsAvailable, dataPts, dependencyPts, points, label },
      action,
      actionLabel: ACTION_LABELS[action],
    } satisfies ScoredNode;
  });

  const ranks = rankDescending(partial.map((x) => x.priority));
  return partial.map((x, i) => ({ ...x, rank: ranks[i] }));
}

// ---------------------------------------------------------------------------
// Weights helpers & scenarios
// ---------------------------------------------------------------------------

export function applyScenario(base: Weights, s: Scenario): Weights {
  return {
    ...base,
    vuln: {
      financial: s.vuln.financial ?? base.vuln.financial,
      operational: s.vuln.operational ?? base.vuln.operational,
      assurance: s.vuln.assurance ?? base.vuln.assurance,
      geographic: s.vuln.geographic ?? base.vuln.geographic,
    },
    impact: {
      revenue: s.impact.revenue ?? base.impact.revenue,
      recovery: s.impact.recovery ?? base.impact.recovery,
      centrality: s.impact.centrality ?? base.impact.centrality,
    },
  };
}

/** Rescale a weight group so it sums to 1 (sliders auto-normalise). */
export function normaliseGroup<T extends Record<string, number>>(group: T): { weights: T; rawSum: number } {
  const rawSum = Object.values(group).reduce((s, v) => s + v, 0);
  if (rawSum <= 0) return { weights: group, rawSum };
  const out = {} as Record<string, number>;
  for (const [k, v] of Object.entries(group)) out[k] = v / rawSum;
  return { weights: out as T, rawSum };
}

export interface ScenarioResult {
  scenario: Scenario;
  priorities: Record<string, number>;
  ranks: Record<string, number>;
}

export interface SensitivityRow {
  id: string;
  ranks: number[];
  top5Count: number;
  best: number;
  worst: number;
}

export function runSensitivity(data: ScoreInputs, scenarios: Scenario[], base?: Weights) {
  const baseWeights = base ?? data.assumptions.weights;
  const results: ScenarioResult[] = scenarios.map((s) => {
    const scored = scoreNetwork(data, { weights: applyScenario(baseWeights, s) });
    return {
      scenario: s,
      priorities: Object.fromEntries(scored.map((n) => [n.id, n.priority])),
      ranks: Object.fromEntries(scored.map((n) => [n.id, n.rank])),
    };
  });
  const rows: SensitivityRow[] = data.nodes.map((n) => {
    const ranks = results.map((r) => r.ranks[n.id]);
    return {
      id: n.id,
      ranks,
      top5Count: ranks.filter((r) => r <= 5).length,
      best: Math.min(...ranks),
      worst: Math.max(...ranks),
    };
  });
  return { results, rows };
}

// ---------------------------------------------------------------------------
// Concentration
// ---------------------------------------------------------------------------

export interface ComponentConcentration {
  component: string;
  hhi: number;
  nEffTier1: number;
  nEffOwnership: number;
  nEffSubTier: number;
  binding: number;
  illusion: number;
  tier1Shares: { supplierId: string; share: number }[];
  ownerShares: { ownerId: string; share: number; members: string[] }[];
  subTier: { category: string; nEff: number; shares: { supplierId: string; share: number }[] }[];
}

const nEff = (shares: number[]) => {
  const h = shares.reduce((s, x) => s + x * x, 0);
  return h === 0 ? NaN : 1 / h;
};

/** Ultimate owner of an entity via Ownership links (itself if none). */
export function ownerOf(entityId: string, links: Link[]): string {
  const own = links.find((l) => l.type === "Ownership" && l.customerId === entityId);
  return own ? own.supplierId : entityId;
}

/** Components a Tier-2 link feeds, parsed from "Input → M10/M20". */
function linkTargets(input: string): { category: string; components: string[] } {
  const [cat, tgt] = input.split("→").map((s) => s.trim());
  return { category: cat, components: (tgt ?? "").split("/").map((s) => s.trim()).filter(Boolean) };
}

export function computeComponentConcentration(componentIds: string[], links: Link[]): ComponentConcentration[] {
  return componentIds.map((c) => {
    const t1 = links.filter((l) => l.supplierTier === 1 && l.include && l.input === c);
    const tier1Shares = t1.map((l) => ({ supplierId: l.supplierId, share: l.allocation ?? 0 }));
    const hhi = tier1Shares.reduce((s, x) => s + x.share * x.share, 0);
    const nEffTier1 = hhi === 0 ? NaN : 1 / hhi;

    const byOwner = new Map<string, { share: number; members: string[] }>();
    for (const s of tier1Shares) {
      const o = ownerOf(s.supplierId, links);
      const cur = byOwner.get(o) ?? { share: 0, members: [] };
      cur.share += s.share;
      cur.members.push(s.supplierId);
      byOwner.set(o, cur);
    }
    const ownerShares = [...byOwner.entries()].map(([ownerId, v]) => ({ ownerId, ...v }));
    const nEffOwnership = nEff(ownerShares.map((o) => o.share));

    // Critical sub-tier: for each Tier-2 input category feeding this component, how
    // concentrated is it once Tier-1 allocations are traced to the Tier-2 supplier?
    const allocBySupplier = new Map(tier1Shares.map((s) => [s.supplierId, s.share]));
    const cats = new Map<string, Map<string, number>>();
    for (const l of links) {
      if (l.supplierTier !== 2 || !l.include || !l.customerId || !allocBySupplier.has(l.customerId)) continue;
      const { category, components } = linkTargets(l.input);
      if (!components.includes(c)) continue;
      const m = cats.get(category) ?? new Map<string, number>();
      m.set(l.supplierId, (m.get(l.supplierId) ?? 0) + (allocBySupplier.get(l.customerId) ?? 0));
      cats.set(category, m);
    }
    const subTier = [...cats.entries()].map(([category, m]) => {
      const shares = [...m.entries()].map(([supplierId, share]) => ({ supplierId, share }));
      return { category, nEff: nEff(shares.map((s) => s.share)), shares };
    });
    const nEffSubTier = subTier.length > 0 ? Math.min(...subTier.map((s) => s.nEff)) : nEffOwnership;
    const binding = Math.min(nEffOwnership, nEffSubTier);
    return {
      component: c,
      hhi,
      nEffTier1,
      nEffOwnership,
      nEffSubTier,
      binding,
      illusion: nEffTier1 - binding,
      tier1Shares,
      ownerShares,
      subTier,
    };
  });
}

export interface ZoneConcentration {
  zone: string;
  nodeIds: string[];
  maxExposure: PerProduct;
  revenueAtStake: number;
  share: number;
  confirmedMaxExposure: PerProduct;
  confirmedRevenue: number;
  hazard: number | null;
  logistics: number | null;
  infrastructure: number | null;
}

export function computeZoneConcentration(
  zones: string[],
  scored: ScoredNode[],
  data: Pick<Dataset, "entities" | "indicators" | "assumptions">,
): ZoneConcentration[] {
  const a = data.assumptions;
  return zones.map((z) => {
    const inZone = scored.filter((n) => n.input.zone === z);
    const maxBy = (ns: ScoredNode[]) => {
      const m = zero();
      for (const n of ns) for (const p of PRODUCT_IDS) m[p] = Math.max(m[p], n.exposure[p]);
      return m;
    };
    const maxExposure = maxBy(inZone);
    const confirmedMaxExposure = maxBy(inZone.filter((n) => n.confidence.dependencyPts === 1));
    const revenueAtStake = revenueOf(maxExposure, a);
    // Zone indices are identical for every entity in a zone; read from the first entity located there.
    const first = data.entities.find((e) => e.facilityZone === z);
    const ind = first ? data.indicators.find((r) => r.id === first.id) : undefined;
    return {
      zone: z,
      nodeIds: inZone.map((n) => n.id),
      maxExposure,
      revenueAtStake,
      share: revenueAtStake / a.totalRevenue,
      confirmedMaxExposure,
      confirmedRevenue: revenueOf(confirmedMaxExposure, a),
      hazard: ind?.physicalHazard ?? null,
      logistics: ind?.logisticsFriction ?? null,
      infrastructure: ind?.infrastructure ?? null,
    };
  });
}

export function zonesOf(entities: Dataset["entities"]): string[] {
  return [...new Set(entities.map((e) => e.facilityZone))].filter((z) => /^Z\d{2}$/.test(z)).sort();
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AlertLevel = "HIGH" | "MEDIUM" | "LOW – verify" | "LOG only" | "MERGED" | "SUPPRESS – stale" | "SUPPRESS – wrong entity";

export interface AlertScoreInput {
  id: string;
  published: string;
  effective: string;
  sourceFamily: string;
  title: string;
  primaryNode: string | null;
  severity: number;
  credibility: number;
  match: number;
  exposureOverride: number | null;
}

export interface AlertResult {
  id: string;
  duplicateOf: string | null;
  ageDays: number;
  stale: boolean;
  S: number;
  C: number;
  M: number;
  E: number;
  vulnFactor: number;
  score: number;
  level: AlertLevel;
  levelLabel: string; // e.g. "MERGED into EV-001"
}

const DAY_MS = 86_400_000;
export const daysBetween = (laterIso: string, earlierIso: string) =>
  Math.round((Date.parse(laterIso + "T00:00:00Z") - Date.parse(earlierIso + "T00:00:00Z")) / DAY_MS);

/** Token-set similarity (Jaccard) used for de-dup when the source family is blank. */
export function titleSimilarity(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const A = tok(a);
  const B = tok(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function findDuplicate(ev: AlertScoreInput, prior: AlertScoreInput[]): AlertScoreInput | null {
  for (const p of prior) {
    if (ev.sourceFamily && p.sourceFamily && ev.sourceFamily === p.sourceFamily) return p;
    if (!ev.sourceFamily && titleSimilarity(ev.title, p.title) > 0.85 && ev.effective === p.effective) return p;
  }
  return null;
}

export function scoreAlert(
  ev: AlertScoreInput,
  prior: AlertScoreInput[],
  nodeById: Map<string, ScoredNode>,
  a: Assumptions,
): AlertResult {
  const dup = findDuplicate(ev, prior);
  const ageDays = daysBetween(ev.published, ev.effective);
  const stale = ageDays > a.alert.staleDays;
  const node = ev.primaryNode ? nodeById.get(ev.primaryNode) : undefined;
  const E = ev.exposureOverride ?? (node ? node.share : 1); // unresolved location → upper bound 1.0
  const vulnFactor = node ? 0.5 + node.V / 200 : 0.75;
  const C = dup || stale ? 0 : ev.credibility;
  const score = stale ? 0 : 100 * ev.severity * C * ev.match * E * vulnFactor;
  const s = xl(score);
  let level: AlertLevel;
  if (dup) level = "MERGED";
  else if (stale) level = "SUPPRESS – stale";
  else if (ev.match === 0) level = "SUPPRESS – wrong entity";
  else if (s >= a.alert.high) level = "HIGH";
  else if (s >= a.alert.medium) level = "MEDIUM";
  else if (s >= a.alert.low) level = "LOW – verify";
  else level = "LOG only";
  return {
    id: ev.id,
    duplicateOf: dup?.id ?? null,
    ageDays,
    stale,
    S: ev.severity,
    C,
    M: ev.match,
    E,
    vulnFactor,
    score,
    level,
    levelLabel: level === "MERGED" ? `MERGED into ${dup!.id}` : level,
  };
}

export function scoreEventFeed(events: EventInput[], scored: ScoredNode[], a: Assumptions): AlertResult[] {
  const byId = new Map(scored.map((n) => [n.id, n]));
  return events.map((ev, i) => scoreAlert(ev, events.slice(0, i), byId, a));
}

// ---------------------------------------------------------------------------
// Alternates
// ---------------------------------------------------------------------------

export function fitment(s: CriterionScores, a: Assumptions): number {
  const w = a.fitment.weights;
  return (
    ((s.technical * w.technical +
      s.application * w.application +
      s.footprint * w.footprint +
      s.scale * w.scale +
      s.presence * w.presence +
      s.qualEase * w.qualEase) /
      5) *
    100
  );
}

export function recommendAlternate(rawFit: number, risk: Alternate["risk"], a: Assumptions, notIndependent = false): string {
  const fit = xl(rawFit);
  if (notIndependent) return "EXCLUDE – not independent of the failed node";
  if (risk === "Red") return "EXCLUDE – failed risk screen";
  if (fit >= a.fitment.shortlist) return risk === "Amber" ? "SHORTLIST – with risk conditions" : "SHORTLIST – issue RFI";
  if (fit >= a.fitment.reserve) return "RESERVE";
  return "Not shortlisted";
}

// ---------------------------------------------------------------------------
// Model integrity checks (the workbook's Checks tab, re-run in the app)
// ---------------------------------------------------------------------------

export interface CheckResult {
  n: number;
  check: string;
  value: string;
  pass: boolean;
}

export function runChecks(data: Dataset, scored: ScoredNode[], weights: Weights = data.assumptions.weights): CheckResult[] {
  const a = data.assumptions;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);
  const close = (x: number) => Math.abs(x - 1) < 1e-4;
  const vSum = sum(weights.vuln);
  const iSum = sum(weights.impact);
  const fSum = sum(a.fitment.weights as unknown as Record<string, number>);
  const ranks = scored.map((n) => n.rank);
  const uniqueRanks = ranks.filter((r) => ranks.indexOf(r) === ranks.lastIndexOf(r)).length;
  const exps = scored.flatMap((n) => PRODUCT_IDS.map((p) => n.exposure[p]));
  const t1Links = data.links.filter((l) => l.type === "Tier-1 supply");
  const t1A = t1Links.filter((l) => l.grade === "A").length;
  const finite = (xs: number[]) => xs.every((x) => Number.isFinite(x));
  const scoreNumbers = scored.flatMap((n) => [n.V, n.I, n.priority, n.share, n.rar]);
  const conc = computeComponentConcentration(data.components.map((c) => c.id), data.links);
  const zones = computeZoneConcentration(zonesOf(data.entities), scored, data);
  const alerts = scoreEventFeed(data.events, scored, a);
  const fits = data.alternates.map((x) => fitment(x.scores, a));
  const sens = runSensitivity(data, data.scenarios, weights);
  const sensUnique = sens.results.map((r) => {
    const rs = Object.values(r.ranks);
    return rs.filter((x) => rs.indexOf(x) === rs.lastIndexOf(x)).length;
  });
  const ev002 = alerts.find((x) => x.id === "EV-002");
  const n = scored.length;

  return [
    { n: 1, check: "Vulnerability pillar weights sum to 100%", value: vSum.toFixed(4), pass: close(vSum) },
    { n: 2, check: "Impact weights sum to 100%", value: iSum.toFixed(4), pass: close(iSum) },
    { n: 3, check: "Fitment weights sum to 100%", value: fSum.toFixed(4), pass: close(fSum) },
    {
      n: 4,
      check: "Alert thresholds ordered High > Medium > Low",
      value: `${a.alert.high} / ${a.alert.medium} / ${a.alert.low}`,
      pass: a.alert.high > a.alert.medium && a.alert.medium > a.alert.low,
    },
    {
      n: 5,
      check: "Stale threshold (days) is positive and larger than any alert threshold",
      value: String(a.alert.staleDays),
      pass: a.alert.staleDays > 0 && a.alert.staleDays > a.alert.high,
    },
    {
      n: 6,
      check: "Market research date is on/after case cut-off",
      value: `${a.dates.caseCutoff} → ${a.dates.researchAsOf}`,
      pass: a.dates.researchAsOf >= a.dates.caseCutoff,
    },
    { n: 7, check: `Scorecard ranks are unique (1-${n})`, value: String(uniqueRanks), pass: uniqueRanks === n },
    {
      n: 8,
      check: "All product exposures between 0% and 100%",
      value: Math.max(...exps).toFixed(2),
      pass: exps.every((e) => e >= 0 && e <= 1),
    },
    { n: 9, check: "Every Tier-1 link is evidence grade A", value: `${t1A} of ${t1Links.length}`, pass: t1A === t1Links.length },
    {
      n: 10,
      check: "Evidence ledger holds all 59 case records",
      value: String(data.evidence.length),
      pass: data.evidence.length === 59,
    },
    { n: 11, check: "No calculation errors – Scorecard", value: finite(scoreNumbers) ? "0" : "error", pass: finite(scoreNumbers) },
    {
      n: 12,
      check: "No calculation errors – Network / Concentration",
      value: finite([...conc.map((c) => c.binding), ...zones.map((z) => z.revenueAtStake)]) ? "0" : "error",
      pass: finite([...conc.map((c) => c.binding), ...zones.map((z) => z.revenueAtStake)]),
    },
    {
      n: 13,
      check: "No calculation errors – Alerts / Alternates",
      value: finite([...alerts.map((x) => x.score), ...fits]) ? "0" : "error",
      pass: finite([...alerts.map((x) => x.score), ...fits]),
    },
    {
      n: 14,
      check: "Sensitivity ranks unique in every scenario",
      value: sensUnique.join(" / "),
      pass: sensUnique.every((u) => u === n),
    },
    {
      n: 15,
      check: "Duplicate event EV-002 is merged, not counted",
      value: ev002?.levelLabel ?? "missing",
      pass: ev002?.level === "MERGED",
    },
  ];
}

// ---------------------------------------------------------------------------
// One-call model build for the UI
// ---------------------------------------------------------------------------

export function buildModel(data: Dataset, weights: Weights = data.assumptions.weights) {
  const scored = scoreNetwork(data, { weights });
  const byId = new Map(scored.map((n) => [n.id, n]));
  const alerts = scoreEventFeed(data.events, scored, data.assumptions);
  const components = computeComponentConcentration(
    data.components.map((c) => c.id),
    data.links,
  );
  const zones = computeZoneConcentration(zonesOf(data.entities), scored, data);
  return { scored, byId, alerts, components, zones };
}

export type Model = ReturnType<typeof buildModel>;

export function productRevenue(a: Assumptions): Record<ProductId, number> {
  return Object.fromEntries(a.products.map((p) => [p.id, p.revenue])) as Record<ProductId, number>;
}
