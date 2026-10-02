// Shared data contracts. Everything under /data is produced by scripts/extract.ts
// from the mother workbook; nothing here is a computed score.

export type ProductId = "P1" | "P2" | "P3";
export const PRODUCT_IDS: ProductId[] = ["P1", "P2", "P3"];
export type PerProduct = Record<ProductId, number>;

export interface Product {
  id: ProductId;
  name: string;
  revenue: number; // USD m / yr
  weeklyUnits: number | null;
  footprint: string;
}

export interface Component {
  id: string;
  name: string;
  application: string;
  leadTimeWeeks: number;
  products: ProductId[];
  useCase: string;
  screeningCriteria: string;
}

export interface Indicators {
  currentRatio: number | null;
  netDebtEbitda: number | null;
  otd3m: number | null;
  otdDelta: number | null;
  assuranceGap: number | null;
  physicalHazard: number | null;
  logisticsFriction: number | null;
  infrastructure: number | null;
}
export const INDICATOR_KEYS: (keyof Indicators)[] = [
  "currentRatio",
  "netDebtEbitda",
  "otd3m",
  "otdDelta",
  "assuranceGap",
  "physicalHazard",
  "logisticsFriction",
  "infrastructure",
];

export interface IndicatorRow extends Indicators {
  id: string;
  name: string;
}

export interface Entity {
  id: string;
  legalName: string;
  type: string;
  capability: string;
  registeredMarket: string;
  registeredZone: string;
  primaryFacilityId: string;
  primaryFacilityName: string;
  facilityZone: string;
  facilityRole: string;
  facilityCapability: string;
  otherSitesNote: string | null;
}

export type SiteRole = "production" | "hq" | "pilot" | "logistics" | "office" | "own-plant";

export interface Site {
  id: string; // SITE-xxx, or NOVADRIVE-<name> for NovaDrive's own plants
  name: string;
  entityId: string;
  zone: string | null; // null = not disclosed
  role: SiteRole;
  source: string;
}

export type LinkStatus = "Confirmed" | "Inferred" | "Hypothesis" | "Context" | "Rejected";
export type Grade = "A" | "B" | "C" | "D";

export interface Link {
  id: string;
  type: string; // Tier-1 supply, Tier-2 supply, Tier-3 supply, Hypothesis, Ownership, Logistics, Rejected
  supplierTier: 1 | 2 | 3 | null;
  supplierId: string;
  supplierName: string;
  customerId: string | null;
  customerName: string | null;
  input: string;
  products: string;
  productFlags: PerProduct; // Tier-1 links only; 0 elsewhere
  allocation: number | null; // Tier-1 planning allocation
  siteId: string | null;
  zone: string | null;
  evidence: { id: string; corroborating: boolean }[];
  sourceFamilyCount: number;
  status: LinkStatus;
  grade: Grade | null;
  include: boolean;
  notes: string;
}

export interface EvidenceRecord {
  id: string;
  date: string; // ISO yyyy-mm-dd
  type: string;
  sourceFamily: string;
  title: string;
  recordStatus: string;
  verdict: string;
  usedFor: string;
  reasoning: string;
  detail: string | null; // verbatim evidence text from the case workbook
  locator: string | null;
}

export interface NodeInput {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  role: string;
  facility: string;
  zone: string;
  dependencyStatus: string;
  downstreamT1: number;
  ttrWeeks: number;
  ttrBasis: string;
  eventOverlay: 0 | 1;
}

export interface EventInput {
  id: string;
  published: string; // ISO
  effective: string; // ISO
  title: string;
  detail: string | null;
  sourceFamily: string;
  sourceType: string | null;
  dedupText: string;
  resolutionText: string;
  matchedText: string;
  primaryNode: string | null;
  severity: number;
  credibility: number;
  match: number;
  exposureOverride: number | null; // literal E in the workbook; null = take primary node's revenue share
  why: string;
  nextAction: string;
  verification: string;
  owner: string;
  escalation: string;
}

export interface CriterionScores {
  technical: number;
  application: number;
  footprint: number;
  scale: number;
  presence: number;
  qualEase: number;
}

export type RiskScreen = "Green" | "Amber" | "Red";

export interface Alternate {
  n: number;
  trigger: string;
  component: string;
  route: string;
  candidate: string;
  evidence: string;
  footprint: string;
  source: string;
  sourceDate: string;
  scores: CriterionScores;
  risk: RiskScreen;
  riskNote: string;
  validate: string;
}

export interface Curve {
  x: number[];
  y: number[];
  basis: string;
}

export interface Weights {
  vuln: { financial: number; operational: number; assurance: number; geographic: number };
  finSplit: { leverage: number; liquidity: number };
  opSplit: { level: number; trend: number };
  overlayPoints: number;
  impact: { revenue: number; recovery: number; centrality: number };
  imputePercentile: number;
}

export interface Assumptions {
  products: Product[];
  totalRevenue: number;
  weights: Weights;
  ttrCap: number;
  centralityMax: number;
  curves: { leverage: Curve; liquidity: Curve; otdLevel: Curve; otdTrend: Curve };
  bands: { critical: number; high: number; elevated: number };
  quadrant: { impactHigh: number; vulnHigh: number };
  confidence: { high: number; medium: number };
  fitment: {
    weights: CriterionScores;
    shortlist: number;
    reserve: number;
  };
  alert: { high: number; medium: number; low: number; staleDays: number };
  dates: { caseCutoff: string; researchAsOf: string };
}

export interface Scenario {
  id: string;
  name: string;
  rationale: string;
  // null = inherit the live base weight
  vuln: { financial: number | null; operational: number | null; assurance: number | null; geographic: number | null };
  impact: { revenue: number | null; recovery: number | null; centrality: number | null };
}

export interface Unknown {
  n: number;
  unknown: string;
  decision: string;
  nodes: string;
  resolve: string;
  owner: string;
  priority: string;
}

export interface Action {
  n: number;
  horizon: string;
  phase: "Respond" | "Hedge" | "Restructure" | "Govern";
  action: string;
  addresses: string;
  owner: string;
  kpi: string;
  effort: string;
  valueNodeId: string | null; // value protected = this node's revenue-at-risk (computed by the engine)
}

export interface ConcentrationJudgement {
  component: string;
  usedIn: string;
  binding: string;
  readout: string;
}

export interface ZoneNote {
  zone: string;
  nodesLabel: string;
  readout: string;
}

export interface Dataset {
  assumptions: Assumptions;
  scenarios: Scenario[];
  products: Product[];
  components: Component[];
  indicators: IndicatorRow[];
  entities: Entity[];
  sites: Site[];
  links: Link[];
  evidence: EvidenceRecord[];
  nodes: NodeInput[];
  events: EventInput[];
  alternates: Alternate[];
  unknowns: Unknown[];
  actions: Action[];
  concentrationNotes: ConcentrationJudgement[];
  zoneNotes: ZoneNote[];
}
