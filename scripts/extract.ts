/**
 * Reads the mother workbook (and the organisers' case workbook for product,
 * component, evidence-detail and event-detail text) and writes typed JSON into
 * /data. Only INPUT cells are copied. Computed columns (scores, ranks,
 * exposures, fitment, alert scores) are written separately to
 * tests/fixtures/workbook-expected.json and are used by the parity tests only.
 *
 * Usage: npm run extract [-- <model.xlsx> <case.xlsx>]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";
import type {
  Action,
  Alternate,
  Assumptions,
  Component,
  ConcentrationJudgement,
  Curve,
  Entity,
  EventInput,
  EvidenceRecord,
  Grade,
  IndicatorRow,
  Link,
  LinkStatus,
  NodeInput,
  Product,
  ProductId,
  RiskScreen,
  Scenario,
  Site,
  SiteRole,
  Unknown,
  ZoneNote,
} from "../lib/types";

const root = path.resolve(__dirname, "..");
const modelPath = path.resolve(process.argv[2] ?? path.join(root, "source", "NovaDrive_Supplier_Risk_Model.xlsx"));
const casePath = path.resolve(process.argv[3] ?? path.join(root, "source", "Samanvay_Consularium_NovaDrive_Data.xlsx"));

const model = XLSX.readFile(modelPath);
const caseWb = XLSX.readFile(casePath);

// ---------- cell helpers ----------
type Sheet = XLSX.WorkSheet;
function sheet(wb: XLSX.WorkBook, name: string): Sheet {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Missing sheet "${name}"`);
  return ws;
}
function cell(ws: Sheet, addr: string): XLSX.CellObject | undefined {
  return ws[addr] as XLSX.CellObject | undefined;
}
function raw(ws: Sheet, addr: string): unknown {
  const c = cell(ws, addr);
  if (!c || c.v === undefined || c.v === null || c.v === "") return null;
  return c.v;
}
function str(ws: Sheet, addr: string): string {
  const v = raw(ws, addr);
  return v === null ? "" : String(v).trim();
}
function strOrNull(ws: Sheet, addr: string): string | null {
  const s = str(ws, addr);
  return s === "" ? null : s;
}
function num(ws: Sheet, addr: string): number | null {
  const v = raw(ws, addr);
  if (v === null) return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) && String(v).trim() !== "" ? n : null;
}
function numReq(ws: Sheet, addr: string): number {
  const n = num(ws, addr);
  if (n === null) throw new Error(`Expected number at ${addr}`);
  return n;
}
function isFormula(ws: Sheet, addr: string): boolean {
  return Boolean(cell(ws, addr)?.f);
}
function isoDate(ws: Sheet, addr: string): string {
  const c = cell(ws, addr);
  if (!c || c.v === undefined) throw new Error(`Expected date at ${addr}`);
  if (typeof c.v === "number") {
    const d = XLSX.SSF.parse_date_code(c.v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(c.v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error(`Unparseable date "${s}" at ${addr}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}
const r = (col: string, row: number) => `${col}${row}`;

// ---------- Assumptions ----------
const A = sheet(model, "Assumptions");
const curve = (row: number): Curve => ({
  x: ["B", "C", "D", "E", "F", "G"].map((c) => numReq(A, r(c, row))),
  y: ["H", "I", "J", "K", "L", "M"].map((c) => numReq(A, r(c, row))),
  basis: str(A, r("N", row)),
});

const BC = sheet(caseWb, "Business Context");
const products: Product[] = [2, 3, 4].map((row, i) => {
  const id = str(BC, r("A", row)) as ProductId;
  const assumptionsRow = 5 + i;
  if (!str(A, r("A", assumptionsRow)).startsWith(id)) throw new Error(`Product order mismatch at Assumptions!A${assumptionsRow}`);
  return {
    id,
    name: str(BC, r("B", row)),
    revenue: numReq(A, r("B", assumptionsRow)), // model workbook is the source of truth for revenue
    weeklyUnits: num(BC, r("D", row)),
    footprint: str(BC, r("E", row)),
  };
});

const assumptions: Assumptions = {
  products,
  totalRevenue: products.reduce((s, p) => s + p.revenue, 0),
  weights: {
    vuln: {
      financial: numReq(A, "B11"),
      operational: numReq(A, "B12"),
      assurance: numReq(A, "B13"),
      geographic: numReq(A, "B14"),
    },
    finSplit: { leverage: numReq(A, "B16"), liquidity: numReq(A, "B17") },
    opSplit: { level: numReq(A, "B18"), trend: numReq(A, "B19") },
    overlayPoints: numReq(A, "B20"),
    impact: { revenue: numReq(A, "B23"), recovery: numReq(A, "B24"), centrality: numReq(A, "B25") },
    imputePercentile: numReq(A, "B36"),
  },
  ttrCap: numReq(A, "B26"),
  centralityMax: numReq(A, "B27"),
  curves: { leverage: curve(31), liquidity: curve(32), otdLevel: curve(33), otdTrend: curve(34) },
  bands: { critical: numReq(A, "B39"), high: numReq(A, "B40"), elevated: numReq(A, "B41") },
  quadrant: { impactHigh: numReq(A, "B42"), vulnHigh: numReq(A, "B43") },
  confidence: { high: numReq(A, "B44"), medium: numReq(A, "B45") },
  fitment: {
    weights: {
      technical: numReq(A, "B49"),
      application: numReq(A, "B50"),
      footprint: numReq(A, "B51"),
      scale: numReq(A, "B52"),
      presence: numReq(A, "B53"),
      qualEase: numReq(A, "B54"),
    },
    shortlist: numReq(A, "B56"),
    reserve: numReq(A, "B57"),
  },
  alert: {
    high: numReq(A, "B60"),
    medium: numReq(A, "B61"),
    low: numReq(A, "B62"),
    staleDays: numReq(A, "B63"),
  },
  dates: { caseCutoff: isoDate(A, "B64"), researchAsOf: isoDate(A, "B65") },
};

// ---------- Sensitivity scenarios ----------
const SE = sheet(model, "Sensitivity");
const scenarioWeight = (addr: string): number | null =>
  // A formula pointing at Assumptions means "use the live base weight"
  isFormula(SE, addr) ? null : numReq(SE, addr);
const scenarios: Scenario[] = [5, 6, 7, 8, 9].map((row) => {
  const label = str(SE, r("A", row));
  const [id, ...rest] = label.split(" ");
  return {
    id,
    name: rest.join(" "),
    rationale: str(SE, r("I", row)),
    vuln: {
      financial: scenarioWeight(r("B", row)),
      operational: scenarioWeight(r("C", row)),
      assurance: scenarioWeight(r("D", row)),
      geographic: scenarioWeight(r("E", row)),
    },
    impact: {
      revenue: scenarioWeight(r("F", row)),
      recovery: scenarioWeight(r("G", row)),
      centrality: scenarioWeight(r("H", row)),
    },
  };
});

// ---------- Components ----------
const CC = sheet(caseWb, "Components Context");
const components: Component[] = [];
for (let row = 2; row <= 8; row++) {
  const criteria = str(CC, r("E", row));
  const line = (n: number) =>
    (criteria.split(/\r?\n/).find((l) => l.trim().startsWith(`${n}.`)) ?? "").replace(/^\s*\d\.\s*[^:]*:\s*/, "").trim();
  components.push({
    id: str(CC, r("A", row)),
    name: str(CC, r("B", row)),
    application: str(CC, r("C", row)),
    leadTimeWeeks: numReq(CC, r("D", row)),
    products: line(1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as ProductId[],
    useCase: line(2),
    screeningCriteria: line(3),
  });
}

// ---------- Data: indicators + supplier universe ----------
const D = sheet(model, "Data");
const indicators: IndicatorRow[] = [];
for (let row = 5; row <= 34; row++) {
  indicators.push({
    id: str(D, r("A", row)),
    name: str(D, r("B", row)),
    currentRatio: num(D, r("C", row)),
    netDebtEbitda: num(D, r("D", row)),
    otd3m: num(D, r("E", row)),
    otdDelta: num(D, r("F", row)),
    assuranceGap: num(D, r("G", row)),
    physicalHazard: num(D, r("H", row)),
    logisticsFriction: num(D, r("I", row)),
    infrastructure: num(D, r("J", row)),
  });
}

const entities: Entity[] = [];
for (let row = 38; row <= 67; row++) {
  entities.push({
    id: str(D, r("A", row)),
    legalName: str(D, r("B", row)),
    type: str(D, r("C", row)),
    capability: str(D, r("D", row)),
    registeredMarket: str(D, r("E", row)),
    registeredZone: str(D, r("F", row)),
    primaryFacilityId: str(D, r("G", row)),
    primaryFacilityName: str(D, r("H", row)),
    facilityZone: str(D, r("I", row)),
    facilityRole: str(D, r("J", row)),
    facilityCapability: str(D, r("K", row)),
    otherSitesNote: strOrNull(D, r("L", row)),
  });
}

function primaryRole(e: Entity): SiteRole {
  if (e.facilityRole === "Manufacturing") return "production";
  if (e.type.startsWith("Logistics")) return "logistics";
  if (e.type === "Holding company") return "hq";
  return "office";
}
const sites: Site[] = [];
for (const e of entities) {
  sites.push({
    id: e.primaryFacilityId,
    name: e.primaryFacilityName,
    entityId: e.id,
    zone: e.facilityZone,
    role: primaryRole(e),
    source: "Case Supplier Universe – primary facility",
  });
  if (e.otherSitesNote) {
    // e.g. "SITE-900 - IonPeak Western Development Center (Research and pilot line, Z05)"
    const m = e.otherSitesNote.match(/^(SITE-\d+)\s*-\s*(.+?)\s*\((.+),\s*(Z\d{2})\)\s*$/);
    if (!m) throw new Error(`Unparseable other-site note for ${e.id}: ${e.otherSitesNote}`);
    const desc = m[3].toLowerCase();
    sites.push({
      id: m[1],
      name: m[2],
      entityId: e.id,
      zone: m[4],
      role: desc.includes("pilot") ? "pilot" : desc.includes("headquarters") ? "hq" : "office",
      source: `Case Supplier Universe – other known site: ${m[3]}`,
    });
  }
}
// NovaDrive's own plants (Business Context footprint). Zones are not disclosed in the case.
const ownPlants = new Set<string>();
for (const p of products) for (const part of p.footprint.split(";")) ownPlants.add(part.replace(/\(.*\)/, "").trim());
for (const plant of ownPlants) {
  sites.push({
    id: `NOVADRIVE-${plant.replace(/\s+/g, "-").toUpperCase()}`,
    name: plant,
    entityId: "NOVADRIVE",
    zone: null,
    role: "own-plant",
    source: "Case Business Context – NovaDrive manufacturing footprint (zone not disclosed)",
  });
}

// ---------- Network ----------
const N = sheet(model, "Network");
const links: Link[] = [];
for (let row = 5; row <= 45; row++) {
  const tierRaw = num(N, r("C", row));
  const ev = str(N, r("P", row))
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const corroborating = /^\(.*\)$/.test(s);
      return { id: s.replace(/[()]/g, "").trim(), corroborating };
    });
  const grade = str(N, r("S", row));
  const dash = (s: string | null) => (s === null || s === "—" ? null : s);
  links.push({
    id: str(N, r("A", row)),
    type: str(N, r("B", row)),
    supplierTier: tierRaw === 1 || tierRaw === 2 || tierRaw === 3 ? tierRaw : null,
    supplierId: str(N, r("D", row)),
    supplierName: str(N, r("E", row)),
    customerId: dash(strOrNull(N, r("F", row))),
    customerName: dash(strOrNull(N, r("G", row))),
    input: str(N, r("H", row)),
    products: str(N, r("I", row)),
    productFlags: { P1: num(N, r("J", row)) ?? 0, P2: num(N, r("K", row)) ?? 0, P3: num(N, r("L", row)) ?? 0 },
    allocation: num(N, r("M", row)),
    siteId: dash(strOrNull(N, r("N", row))),
    zone: dash(strOrNull(N, r("O", row))),
    evidence: ev,
    sourceFamilyCount: num(N, r("Q", row)) ?? 0,
    status: str(N, r("R", row)) as LinkStatus,
    grade: ["A", "B", "C", "D"].includes(grade) ? (grade as Grade) : null,
    include: num(N, r("U", row)) === 1,
    notes: str(N, r("Y", row)),
  });
}

// ---------- Evidence (model ledger + verbatim detail from case workbook) ----------
const E = sheet(model, "Evidence");
const RE = sheet(caseWb, "Relationship Evidence");
const caseEvidence = new Map<string, { detail: string; locator: string }>();
for (let row = 2; row <= 200; row++) {
  const id = str(RE, r("A", row));
  if (!id) continue;
  caseEvidence.set(id, { detail: str(RE, r("F", row)), locator: str(RE, r("H", row)) });
}
const evidence: EvidenceRecord[] = [];
for (let row = 5; row <= 63; row++) {
  const id = str(E, r("A", row));
  const c = caseEvidence.get(id);
  evidence.push({
    id,
    date: isoDate(E, r("B", row)),
    type: str(E, r("C", row)),
    sourceFamily: str(E, r("D", row)),
    title: str(E, r("E", row)),
    recordStatus: str(E, r("F", row)),
    verdict: str(E, r("G", row)),
    usedFor: str(E, r("H", row)),
    reasoning: str(E, r("I", row)),
    detail: c?.detail ?? null,
    locator: c?.locator ?? null,
  });
}

// ---------- Scorecard inputs ----------
const S = sheet(model, "Scorecard");
const nodes: NodeInput[] = [];
for (let row = 6; row <= 30; row++) {
  const tier = numReq(S, r("C", row));
  if (tier !== 1 && tier !== 2 && tier !== 3) throw new Error(`Bad tier at Scorecard!C${row}`);
  nodes.push({
    id: str(S, r("A", row)),
    name: str(S, r("B", row)),
    tier,
    role: str(S, r("D", row)),
    facility: str(S, r("E", row)),
    zone: str(S, r("F", row)),
    dependencyStatus: str(S, r("G", row)),
    downstreamT1: numReq(S, r("H", row)),
    ttrWeeks: numReq(S, r("I", row)),
    ttrBasis: str(S, r("J", row)),
    eventOverlay: numReq(S, r("AC", row)) === 1 ? 1 : 0,
  });
}

// ---------- Alerts ----------
const AL = sheet(model, "Alerts");
const RF = sheet(caseWb, "Risk Event Flags");
const caseEvents = new Map<string, { detail: string; sourceType: string }>();
for (let row = 2; row <= 50; row++) {
  const id = str(RF, r("A", row));
  if (id) caseEvents.set(id, { detail: str(RF, r("E", row)), sourceType: str(RF, r("G", row)) });
}
const events: EventInput[] = [];
for (let row = 5; row <= 12; row++) {
  const id = str(AL, r("A", row));
  const ce = caseEvents.get(id);
  events.push({
    id,
    published: isoDate(AL, r("B", row)),
    effective: isoDate(AL, r("C", row)),
    title: str(AL, r("D", row)),
    detail: ce?.detail ?? null,
    sourceFamily: str(AL, r("E", row)),
    sourceType: ce?.sourceType ?? null,
    dedupText: str(AL, r("F", row)),
    resolutionText: str(AL, r("H", row)),
    matchedText: str(AL, r("I", row)),
    primaryNode: strOrNull(AL, r("J", row)),
    severity: numReq(AL, r("K", row)),
    credibility: numReq(AL, r("L", row)),
    match: numReq(AL, r("M", row)),
    exposureOverride: isFormula(AL, r("N", row)) ? null : numReq(AL, r("N", row)),
    why: str(AL, r("R", row)),
    nextAction: str(AL, r("S", row)),
    verification: str(AL, r("T", row)),
    owner: str(AL, r("U", row)),
    escalation: str(AL, r("V", row)),
  });
}

// ---------- Alternates ----------
const ALT = sheet(model, "Alternates");
const alternates: Alternate[] = [];
for (let row = 5; row <= 32; row++) {
  alternates.push({
    n: numReq(ALT, r("A", row)),
    trigger: str(ALT, r("B", row)),
    component: str(ALT, r("C", row)),
    route: str(ALT, r("D", row)),
    candidate: str(ALT, r("E", row)),
    evidence: str(ALT, r("F", row)),
    footprint: str(ALT, r("G", row)),
    source: str(ALT, r("H", row)),
    sourceDate: str(ALT, r("I", row)),
    scores: {
      technical: numReq(ALT, r("J", row)),
      application: numReq(ALT, r("K", row)),
      footprint: numReq(ALT, r("L", row)),
      scale: numReq(ALT, r("M", row)),
      presence: numReq(ALT, r("N", row)),
      qualEase: numReq(ALT, r("O", row)),
    },
    risk: str(ALT, r("Q", row)) as RiskScreen,
    riskNote: str(ALT, r("R", row)),
    validate: str(ALT, r("T", row)),
  });
}

// ---------- Unknowns, ActionPlan ----------
const U = sheet(model, "Unknowns");
const unknowns: Unknown[] = [];
for (let row = 5; row <= 40; row++) {
  if (num(U, r("A", row)) === null) continue;
  unknowns.push({
    n: numReq(U, r("A", row)),
    unknown: str(U, r("B", row)),
    decision: str(U, r("C", row)),
    nodes: str(U, r("D", row)),
    resolve: str(U, r("E", row)),
    owner: str(U, r("F", row)),
    priority: str(U, r("G", row)),
  });
}
const AP = sheet(model, "ActionPlan");
// "Value protected" cells are live links to a Scorecard RaR cell: keep the node reference, not the number.
const valueNode = (addr: string): string | null => {
  const f = cell(AP, addr)?.f;
  if (!f) return null;
  const m = f.match(/^Scorecard!\$?AK\$?(\d+)$/);
  if (!m) throw new Error(`Unexpected ActionPlan value formula at ${addr}: ${f}`);
  return nodes[Number(m[1]) - 6].id;
};
const actions: Action[] = [];
for (let row = 5; row <= 40; row++) {
  if (num(AP, r("A", row)) === null) continue;
  const horizon = str(AP, r("B", row));
  const phaseWord = horizon.split(":").pop()!.trim().toLowerCase();
  const phase = (phaseWord.charAt(0).toUpperCase() + phaseWord.slice(1)) as Action["phase"];
  actions.push({
    n: numReq(AP, r("A", row)),
    horizon,
    phase,
    action: str(AP, r("C", row)),
    addresses: str(AP, r("D", row)),
    owner: str(AP, r("E", row)),
    kpi: str(AP, r("F", row)),
    effort: str(AP, r("G", row)),
    valueNodeId: valueNode(r("H", row)),
  });
}

// ---------- Concentration analyst text (judgement, not numbers) ----------
const CO = sheet(model, "Concentration");
const concentrationNotes: ConcentrationJudgement[] = [];
for (let row = 5; row <= 11; row++) {
  concentrationNotes.push({
    component: str(CO, r("A", row)),
    usedIn: str(CO, r("B", row)),
    binding: str(CO, r("G", row)),
    readout: str(CO, r("I", row)),
  });
}
const zoneNotes: ZoneNote[] = [];
for (let row = 15; row <= 22; row++) {
  zoneNotes.push({ zone: str(CO, r("A", row)), nodesLabel: str(CO, r("C", row)), readout: str(CO, r("L", row)) });
}

// ---------- Write /data ----------
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });
const write = (file: string, value: unknown) =>
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(value, null, 2) + "\n", "utf8");

write("assumptions.json", assumptions);
write("scenarios.json", scenarios);
write("products.json", products);
write("components.json", components);
write("indicators.json", indicators);
write("entities.json", entities);
write("sites.json", sites);
write("links.json", links);
write("evidence.json", evidence);
write("nodes.json", nodes);
write("events.json", events);
write("alternates.json", alternates);
write("unknowns.json", unknowns);
write("actions.json", actions);
write("concentration-notes.json", { components: concentrationNotes, zones: zoneNotes });

// ---------- Parity fixture: the workbook's own computed values (tests only) ----------
const scorecard = [];
for (let row = 6; row <= 30; row++) {
  const g = (c: string) => raw(S, r(c, row));
  scorecard.push({
    id: g("A"),
    leverageScore: g("S"),
    liquidityScore: g("T"),
    otdScore: g("U"),
    otdTrendScore: g("V"),
    leverageUsed: g("W"),
    liquidityUsed: g("X"),
    assuranceUsed: g("Y"),
    financial: g("Z"),
    operational: g("AA"),
    geographic: g("AB"),
    V: g("AD"),
    exposure: { P1: g("AE"), P2: g("AF"), P3: g("AG") },
    revenueExposed: g("AH"),
    share: g("AI"),
    weekly: g("AJ"),
    rar: g("AK"),
    recoveryScore: g("AL"),
    centralityScore: g("AM"),
    I: g("AN"),
    priority: g("AO"),
    rank: g("AP"),
    band: g("AQ"),
    quadrant: g("AR"),
    linkPts: g("AS"),
    indicatorsAvailable: g("AT"),
    dataPts: g("AU"),
    dependencyPts: g("AV"),
    confidencePts: g("AW"),
    confidence: g("AX"),
    action: g("AY"),
    missing: g("AZ"),
  });
}
const concentration = {
  components: [5, 6, 7, 8, 9, 10, 11].map((row) => ({
    component: raw(CO, r("A", row)),
    hhi: raw(CO, r("C", row)),
    nEffTier1: raw(CO, r("D", row)),
    nEffOwnership: raw(CO, r("E", row)),
    nEffSubTier: raw(CO, r("F", row)),
    illusion: raw(CO, r("H", row)),
  })),
  zones: [15, 16, 17, 18, 19, 20, 21, 22].map((row) => ({
    zone: raw(CO, r("A", row)),
    scoredNodes: raw(CO, r("B", row)),
    maxExposure: { P1: raw(CO, r("D", row)), P2: raw(CO, r("E", row)), P3: raw(CO, r("F", row)) },
    revenueAtStake: raw(CO, r("G", row)),
    share: raw(CO, r("H", row)),
    confirmedRevenue: raw(CO, r("I", row)),
    hazard: raw(CO, r("J", row)),
    logistics: raw(CO, r("K", row)),
  })),
};
const alerts = [5, 6, 7, 8, 9, 10, 11, 12].map((row) => ({
  id: raw(AL, r("A", row)),
  freshness: raw(AL, r("G", row)),
  exposure: raw(AL, r("N", row)),
  vulnFactor: raw(AL, r("O", row)),
  score: raw(AL, r("P", row)),
  level: raw(AL, r("Q", row)),
}));
const alternatesExpected = [];
for (let row = 5; row <= 32; row++)
  alternatesExpected.push({ n: raw(ALT, r("A", row)), fitment: raw(ALT, r("P", row)), recommendation: raw(ALT, r("S", row)) });
const sensitivity = [];
for (let row = 13; row <= 37; row++) {
  sensitivity.push({
    id: raw(SE, r("A", row)),
    priority: ["K", "L", "M", "N", "O"].map((c) => raw(SE, r(c, row))),
    rank: ["P", "Q", "R", "S", "T"].map((c) => raw(SE, r(c, row))),
    top5Count: raw(SE, r("U", row)),
    best: raw(SE, r("V", row)),
    worst: raw(SE, r("W", row)),
  });
}
const CH = sheet(model, "Checks");
const checks = [];
for (let row = 5; row <= 19; row++) checks.push({ n: raw(CH, r("A", row)), check: raw(CH, r("B", row)), status: raw(CH, r("D", row)) });

const fixturesDir = path.join(root, "tests", "fixtures");
fs.mkdirSync(fixturesDir, { recursive: true });
fs.writeFileSync(
  path.join(fixturesDir, "workbook-expected.json"),
  JSON.stringify({ scorecard, concentration, alerts, alternates: alternatesExpected, sensitivity, checks }, null, 2) + "\n",
  "utf8",
);

console.log(
  `Extracted from ${path.basename(modelPath)}: ${nodes.length} nodes, ${links.length} links, ${evidence.length} evidence, ` +
    `${events.length} events, ${alternates.length} alternates, ${sites.length} sites, ${scenarios.length} scenarios.`,
);
