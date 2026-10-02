/**
 * Engine parity with the mother workbook.
 * Part A compares every computed column against the workbook's own cached values
 * (tests/fixtures/workbook-expected.json, written by scripts/extract.ts).
 * Part B is the PRD acceptance table (section 11) at the PRD's ±0.1 tolerance.
 */
import { describe, expect, it } from "vitest";
import expected from "./fixtures/workbook-expected.json";
import { dataset as data } from "@/lib/data";
import {
  ACTION_LABELS,
  IMPUTABLE_LABELS,
  buildModel,
  fitment,
  percentileInc,
  piecewise,
  rankDescending,
  recommendAlternate,
  runChecks,
  runSensitivity,
  type ScoredNode,
} from "@/lib/engine";

const TIGHT = 1e-6;
const model = buildModel(data);
const node = (id: string): ScoredNode => {
  const n = model.byId.get(id);
  if (!n) throw new Error(`missing ${id}`);
  return n;
};
const byName = (prefix: string) => {
  const n = model.scored.find((x) => x.name.startsWith(prefix));
  if (!n) throw new Error(`missing ${prefix}`);
  return n;
};
const near = (actual: number, want: number, tol = TIGHT) => expect(Math.abs(actual - want)).toBeLessThanOrEqual(tol);

// ---------------------------------------------------------------------------
describe("A. Primitives behave like Excel", () => {
  it("piecewise clamps and interpolates", () => {
    const c = data.assumptions.curves.leverage;
    expect(piecewise(-1, c)).toBe(0);
    expect(piecewise(9, c)).toBe(100);
    near(piecewise(3.25, c), 50);
  });
  it("PERCENTILE.INC", () => {
    near(percentileInc([1, 2, 3, 4], 0.75), 3.25);
    near(percentileInc([10], 0.75), 10);
  });
  it("RANK + COUNTIF tie-break by order of appearance", () => {
    expect(rankDescending([5, 9, 5, 1])).toEqual([2, 1, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
describe("A. Scorecard – every computed column for all 25 nodes", () => {
  it("covers the same 25 nodes in the same order", () => {
    expect(model.scored.map((n) => n.id)).toEqual(expected.scorecard.map((r) => r.id));
  });

  for (const row of expected.scorecard) {
    it(`${row.id} matches the workbook`, () => {
      const n = node(row.id as string);
      if (row.leverageScore !== null) near(n.scores.leverage!, row.leverageScore as number);
      else expect(n.scores.leverage).toBeNull();
      if (row.liquidityScore !== null) near(n.scores.liquidity!, row.liquidityScore as number);
      else expect(n.scores.liquidity).toBeNull();
      near(n.scores.otdLevel, row.otdScore as number);
      near(n.scores.otdTrend, row.otdTrendScore as number);
      near(n.scores.leverageUsed, row.leverageUsed as number);
      near(n.scores.liquidityUsed, row.liquidityUsed as number);
      near(n.scores.assuranceUsed, row.assuranceUsed as number);
      near(n.pillars.financial, row.financial as number);
      near(n.pillars.operational, row.operational as number);
      near(n.pillars.geographic, row.geographic as number);
      near(n.V, row.V as number);
      near(n.exposure.P1, row.exposure.P1 as number);
      near(n.exposure.P2, row.exposure.P2 as number);
      near(n.exposure.P3, row.exposure.P3 as number);
      near(n.revenueExposed, row.revenueExposed as number);
      near(n.share, row.share as number);
      near(n.weekly, row.weekly as number);
      near(n.rar, row.rar as number);
      near(n.recoveryScore, row.recoveryScore as number);
      near(n.centralityScore, row.centralityScore as number);
      near(n.I, row.I as number);
      near(n.priority, row.priority as number);
      expect(n.rank).toBe(row.rank);
      expect(n.band).toBe(row.band);
      expect(n.quadrant).toBe(row.quadrant);
      expect(n.confidence.linkPts).toBe(row.linkPts);
      expect(n.confidence.indicatorsAvailable).toBe(row.indicatorsAvailable);
      expect(n.confidence.dataPts).toBe(row.dataPts);
      expect(n.confidence.dependencyPts).toBe(row.dependencyPts);
      expect(n.confidence.points).toBe(row.confidencePts);
      expect(n.confidence.label).toBe(row.confidence);
      expect(n.actionLabel).toBe(row.action);
      const wantMissing =
        row.missing === "—"
          ? []
          : String(row.missing)
              .split(";")
              .map((s) => s.trim())
              .filter(Boolean);
      expect(n.imputed.map((f) => IMPUTABLE_LABELS[f])).toEqual(wantMissing);
    });
  }
});

// ---------------------------------------------------------------------------
describe("A. Concentration", () => {
  for (const row of expected.concentration.components) {
    it(`N_eff ${row.component}`, () => {
      const c = model.components.find((x) => x.component === row.component)!;
      near(c.hhi, row.hhi as number);
      near(c.nEffTier1, row.nEffTier1 as number);
      near(c.nEffOwnership, row.nEffOwnership as number);
      near(c.nEffSubTier, row.nEffSubTier as number);
      near(c.illusion, row.illusion as number);
    });
  }
  for (const row of expected.concentration.zones) {
    it(`zone ${row.zone}`, () => {
      const z = model.zones.find((x) => x.zone === row.zone)!;
      expect(z.nodeIds.length).toBe(row.scoredNodes);
      near(z.maxExposure.P1, row.maxExposure.P1 as number);
      near(z.maxExposure.P2, row.maxExposure.P2 as number);
      near(z.maxExposure.P3, row.maxExposure.P3 as number);
      near(z.revenueAtStake, row.revenueAtStake as number);
      near(z.share, row.share as number);
      near(z.confirmedRevenue, row.confirmedRevenue as number);
      expect(z.hazard).toBe(row.hazard);
      expect(z.logistics).toBe(row.logistics);
    });
  }
});

// ---------------------------------------------------------------------------
describe("A. Sensitivity – 5 scenarios x 25 nodes", () => {
  const sens = runSensitivity(data, data.scenarios);
  for (const row of expected.sensitivity) {
    it(`${row.id} priorities and ranks`, () => {
      sens.results.forEach((r, i) => {
        near(r.priorities[row.id as string], row.priority[i] as number);
        expect(r.ranks[row.id as string]).toBe(row.rank[i]);
      });
      const s = sens.rows.find((x) => x.id === row.id)!;
      expect(s.top5Count).toBe(row.top5Count);
      expect(s.best).toBe(row.best);
      expect(s.worst).toBe(row.worst);
    });
  }
});

// ---------------------------------------------------------------------------
describe("A. Alerts", () => {
  for (const row of expected.alerts) {
    it(`${row.id}`, () => {
      const r = model.alerts.find((x) => x.id === row.id)!;
      near(r.score, row.score as number);
      expect(r.levelLabel).toBe(row.level);
      expect(r.stale).toBe(row.freshness !== "Current");
      // Exposure / vuln factor only matter when the event is scored
      if ((row.score as number) > 0) {
        near(r.E, row.exposure as number);
        near(r.vulnFactor, row.vulnFactor as number);
      }
    });
  }
});

// ---------------------------------------------------------------------------
describe("A. Alternates – fitment and recommendation for all 28", () => {
  for (const row of expected.alternates) {
    it(`#${row.n}`, () => {
      const alt = data.alternates.find((x) => x.n === row.n)!;
      const f = fitment(alt.scores, data.assumptions);
      near(f, row.fitment as number);
      expect(recommendAlternate(f, alt.risk, data.assumptions)).toBe(row.recommendation);
    });
  }
});

// ---------------------------------------------------------------------------
describe("A. Model integrity checks (Checks tab)", () => {
  it("workbook reports ALL PASS", () => {
    expect(expected.checks.every((c) => c.status === "PASS")).toBe(true);
  });
  it("the app re-runs all 15 checks and they PASS", () => {
    const checks = runChecks(data, model.scored);
    expect(checks).toHaveLength(15);
    for (const c of checks) expect(c, `${c.n} ${c.check} = ${c.value}`).toMatchObject({ pass: true });
  });
});

// ---------------------------------------------------------------------------
// B. PRD acceptance criteria (section 11), tolerance ±0.1
// ---------------------------------------------------------------------------
const PRD = 0.1;
describe("B. PRD 11.1 engine parity table", () => {
  const table: [string, number, number, number, number, string, string, string][] = [
    ["Umber Silicon Carbide", 54.7, 93.3, 51.1, 1, "Critical", "Low", "VERIFY_FIRST"],
    ["IonPeak Semiconductor", 50.4, 93.3, 47.0, 2, "Critical", "High", "ACT"],
    ["Meridian Dielectrics", 84.5, 53.3, 45.1, 3, "Critical", "Medium", "ACT"],
    ["Jade Printed Circuits", 52.6, 80.0, 42.1, 4, "High", "High", "ACT"],
    ["Verdant Process Gases", 52.2, 70.0, 36.6, 5, "High", "Low", "VERIFY_FIRST"],
    ["Orion Ceramics", 41.3, 80.0, 33.0, 6, "High", "Medium", "CONFIRM"],
    ["Cobalt Control Electronics", 46.2, 66.7, 30.8, 9, "High", "High", "ACT"],
    ["CommonSpan", 26.5, 76.7, 20.3, 15, "Elevated", "High", "PLAN"],
  ];
  for (const [name, V, I, P, rank, band, conf, action] of table) {
    it(name, () => {
      const n = byName(name);
      near(n.V, V, PRD);
      near(n.I, I, PRD);
      near(n.priority, P, PRD);
      expect(n.rank).toBe(rank);
      expect(n.band).toBe(band);
      expect(n.confidence.label).toBe(conf);
      expect(n.action).toBe(action);
      expect(n.actionLabel).toBe(ACTION_LABELS[n.action]);
    });
  }

  it("all 25 ranks equal the workbook's Scorecard column AP", () => {
    expect(model.scored.map((n) => n.rank)).toEqual(expected.scorecard.map((r) => r.rank));
  });

  it("confidence split is 11 High / 8 Medium / 6 Low", () => {
    const count = (l: string) => model.scored.filter((n) => n.confidence.label === l).length;
    expect([count("High"), count("Medium"), count("Low")]).toEqual([11, 8, 6]);
  });

  it("exposures: IonPeak, Jade, Cobalt 100%; Delta, Meridian 73.3%; Aster 63.3%", () => {
    for (const n of ["IonPeak", "Jade Printed", "Cobalt"]) near(byName(n).share, 1, 0.001);
    for (const n of ["Delta Capacitor", "Meridian"]) near(byName(n).share * 100, 73.3, PRD);
    near(byName("Aster").share * 100, 63.3, PRD);
  });

  it("RaR: IonPeak 1,080 · Cobalt 360 · Meridian 264", () => {
    near(byName("IonPeak").rar, 1080, PRD);
    near(byName("Cobalt").rar, 360, PRD);
    near(byName("Meridian").rar, 264, PRD);
  });

  it("N_eff: M10 1.92 · M20 1.72 · B10 1.47, all collapsing to 1.0", () => {
    const c = (id: string) => model.components.find((x) => x.component === id)!;
    near(c("M10").nEffTier1, 1.92, 0.01);
    near(c("M20").nEffTier1, 1.72, 0.01);
    near(c("B10").nEffTier1, 1.47, 0.01);
    for (const id of ["M10", "M20", "B10"]) expect(c(id).binding).toBe(1);
  });

  it("zone upper bound: Z01 and Z04 = 1,560; Z02 = 1,237.6; Z03 = 1,144", () => {
    const z = (id: string) => model.zones.find((x) => x.zone === id)!.revenueAtStake;
    near(z("Z01"), 1560, PRD);
    near(z("Z04"), 1560, PRD);
    near(z("Z02"), 1237.6, PRD);
    near(z("Z03"), 1144, PRD);
  });
});

describe("B. PRD 11.2 alerts", () => {
  const table: [string, string, number][] = [
    ["EV-001", "HIGH", 42.1],
    ["EV-002", "MERGED into EV-001", 0],
    ["EV-003", "HIGH", 37.9],
    ["EV-004", "SUPPRESS – wrong entity", 0],
    ["EV-005", "SUPPRESS – stale", 0],
    ["EV-007", "LOG only", 1.2],
    ["EV-009", "SUPPRESS – wrong entity", 0],
    ["EV-010", "LOW – verify", 7.2],
  ];
  for (const [id, level, score] of table) {
    it(`${id} → ${level} ${score}`, () => {
      const r = model.alerts.find((x) => x.id === id)!;
      expect(r.levelLabel).toBe(level);
      near(r.score, score, 0.05);
    });
  }
});

describe("B. PRD 11.3 alternates", () => {
  const find = (prefix: string) => data.alternates.find((x) => x.candidate.startsWith(prefix))!;
  const rec = (prefix: string) => {
    const a = find(prefix);
    const f = fitment(a.scores, data.assumptions);
    return { f, r: recommendAlternate(f, a.risk, data.assumptions) };
  };
  it("TDK 94 SHORTLIST · Wolfspeed 72 RESERVE · Steinerfilm EXCLUDE", () => {
    near(rec("TDK").f, 94, PRD);
    expect(rec("TDK").r).toMatch(/^SHORTLIST/);
    near(rec("Wolfspeed").f, 72, PRD);
    expect(rec("Wolfspeed").r).toBe("RESERVE");
    expect(rec("Steinerfilm").r).toMatch(/^EXCLUDE/);
  });
  it("IonPeak shortlist: Infineon 90 · Mitsubishi 81 · Fuji 78", () => {
    near(rec("Infineon").f, 90, PRD);
    near(rec("Mitsubishi").f, 81, PRD);
    near(rec("Fuji").f, 78, PRD);
  });
  it("changing a criterion recomputes fitment; risk never moves with fitment", () => {
    const a = find("Wolfspeed");
    const bumped = { ...a.scores, qualEase: 5 };
    const f = fitment(bumped, data.assumptions);
    expect(f).toBeGreaterThan(72);
    expect(a.risk).toBe("Amber");
    expect(recommendAlternate(f, a.risk, data.assumptions)).toBe("SHORTLIST – with risk conditions");
    expect(recommendAlternate(99, "Red", data.assumptions)).toMatch(/^EXCLUDE/);
  });
  it("a candidate that depends on the failed node is excluded regardless of fitment", () => {
    expect(recommendAlternate(95, "Green", data.assumptions, true)).toMatch(/not independent/);
  });
});

describe("B. Live weights", () => {
  it("weights are read from assumptions, so a change recomputes priority and rank", () => {
    const w = structuredClone(data.assumptions.weights);
    w.vuln = { financial: 0.5, operational: 0.2, assurance: 0.1, geographic: 0.2 };
    const m = buildModel(data, w);
    near(m.byId.get("ORG-210")!.priority, 47.6622, 0.001); // Sensitivity!M28 (credit lens)
    expect(m.byId.get("ORG-210")!.rank).toBe(1);
  });
});
