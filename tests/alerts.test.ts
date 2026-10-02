import { describe, expect, it } from "vitest";
import expected from "./fixtures/workbook-expected.json";
import { caseFeedEvents, processFeed, type FeedEvent } from "@/lib/alertFeed";
import { dataset } from "@/lib/data";
import { buildModel } from "@/lib/engine";
import { findMentions, matchEvent } from "@/lib/matcher";
import { PRESETS } from "@/lib/presets";

const model = buildModel(dataset);
const caseEvents = caseFeedEvents(dataset);
const feed = processFeed(caseEvents, dataset, model);
const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

const simulate = (key: string, extra: Partial<FeedEvent> = {}, before: FeedEvent[] = []) => {
  const p = PRESETS.find((x) => x.key === key)!;
  const ev: FeedEvent = { ...p.event, id: `SIM-${key}`, simulated: true, ...extra };
  const items = processFeed([...caseEvents, ...before, ev], dataset, model);
  return items[items.length - 1];
};

describe("Case feed: the live matcher reproduces the workbook's analyst judgements", () => {
  for (const ev of dataset.events) {
    it(`${ev.id} ${ev.title}`, () => {
      const item = feed.find((f) => f.event.id === ev.id)!;
      const want = expected.alerts.find((a) => a.id === ev.id)!;
      expect(item.alert.levelLabel).toBe(want.level);
      near(item.alert.score, want.score as number);
      const counted = !item.alert.duplicateOf && !item.alert.stale;
      if (counted) {
        expect(item.match.S).toBe(ev.severity);
        expect(item.match.C).toBe(ev.credibility);
        expect(item.match.M).toBe(ev.match);
        expect(item.match.primaryNode).toBe(ev.primaryNode);
      }
    });
  }
  it("EV-001 matches all five Z01 production nodes and excludes SITE-900 / SITE-901", () => {
    const m = feed.find((f) => f.event.id === "EV-001")!.match;
    expect(m.matchedNodes.sort()).toEqual(["ORG-439", "ORG-453", "ORG-455", "ORG-708", "ORG-736"]);
  });
  it("EV-004 resolves on the registry number and cites DOC-077", () => {
    const m = feed.find((f) => f.event.id === "EV-004")!.match;
    expect(m.kind).toBe("wrong-entity");
    expect(m.resolution).toContain("Ion Peak Trading");
    expect(m.evidence).toContain("DOC-077");
  });
});

describe("Simulated events (PRD 6.6 presets)", () => {
  it("Fire at Cobalt Works → exact match, HIGH, 100% of revenue", () => {
    const r = simulate("fire");
    expect(r.match.primaryNode).toBe("ORG-119");
    expect(r.match.M).toBe(1);
    expect(r.match.S).toBe(1);
    expect(r.alert.level).toBe("HIGH");
    near(r.revenueAtStake, 1560, 1e-6);
  });

  it("Typhoon warning for Z04 → zone match to Cobalt, Grove, Lumen, Rill, Xenon", () => {
    const r = simulate("typhoon");
    expect(r.match.kind).toBe("zone");
    expect(r.match.M).toBe(0.8);
    expect(r.match.C).toBe(1);
    expect(r.match.matchedNodes.sort()).toEqual(["ORG-103", "ORG-119", "ORG-179", "ORG-469", "ORG-942"]);
    expect(r.match.primaryNode).toBe("ORG-119");
    expect(r.alert.level).toBe("HIGH");
  });

  it("IonPeak Western Ridge pilot line → SITE-900 non-production, M 0.2, LOW with an explanation", () => {
    const r = simulate("pilot");
    expect(r.match.primaryNode).toBe("ORG-439");
    expect(r.match.siteId).toBe("SITE-900");
    expect(r.match.M).toBe(0.2);
    expect(["LOW – verify", "LOG only"]).toContain(r.alert.level);
    expect(r.match.resolution).toMatch(/not production/);
    expect(r.match.evidence).toContain("DOC-077");
  });

  it("Harbor Works strike → asks: own plant vs Harbor Freight SITE-242; both flagged by default", () => {
    const r = simulate("harbor");
    expect(r.provisional).toBe(true);
    expect(r.match.ambiguous!.options.map((o) => o.key).sort()).toEqual(["NOVADRIVE-HARBOR-WORKS", "SITE-242"]);
    const chooseFreight = simulate("harbor", { choice: "SITE-242" });
    expect(chooseFreight.provisional).toBe(false);
    expect(chooseFreight.match.primaryNode).toBe("ORG-247"); // Harbor Freight consolidates dies into Aster
    expect(chooseFreight.match.M).toBe(0.2);
    const chooseOwn = simulate("harbor", { choice: "NOVADRIVE-HARBOR-WORKS" });
    expect(chooseOwn.match.kind).toBe("own-plant");
  });

  it("Delta announces layoffs → asks which Delta; Consumer Plastics is suppressed as wrong entity", () => {
    const r = simulate("delta");
    expect(r.match.ambiguous!.options.map((o) => o.key).sort()).toEqual(["ORG-857", "ORG-922"]);
    expect(simulate("delta", { choice: "ORG-922" }).match.primaryNode).toBe("ORG-922");
    expect(simulate("delta", { choice: "ORG-857" }).alert.level).toBe("SUPPRESS – wrong entity");
  });

  it("every preset explains its decision in a sentence", () => {
    for (const p of PRESETS) {
      const r = simulate(p.key);
      expect(r.match.resolution.length).toBeGreaterThan(20);
      expect(r.steps).toHaveLength(5);
    }
  });
});

describe("Pipeline rules", () => {
  it("same source family twice → MERGED", () => {
    const first = { ...PRESETS[0].event, id: "SIM-a", simulated: true };
    const r = simulate("fire", { id: "SIM-b" }, [first]);
    expect(r.alert.levelLabel).toBe("MERGED into SIM-a");
  });
  it("blank source family → duplicate only on near-identical title and same effective date", () => {
    const a = { ...PRESETS[0].event, id: "SIM-a", sourceFamily: "", simulated: true };
    expect(simulate("fire", { id: "SIM-b", sourceFamily: "" }, [a]).alert.level).toBe("MERGED");
    expect(simulate("fire", { id: "SIM-c", sourceFamily: "", effective: "2025-09-29" }, [a]).alert.level).not.toBe("MERGED");
  });
  it("published more than 90 days after effective → SUPPRESS – stale", () => {
    expect(simulate("fire", { effective: "2025-01-01" }).alert.level).toBe("SUPPRESS – stale");
  });
  it("unknown place → M 0.3, 'unknown is not irrelevant'", () => {
    const m = matchEvent({ title: "Storm closes Saltmarsh port", text: "", sourceType: "Report" }, dataset, model);
    expect(m.kind).toBe("unresolved");
    expect(m.M).toBe(0.3);
    expect(m.networkMatch).toMatch(/unknown is not irrelevant/);
  });
  it("'East Delta' is a place, not the Delta entities", () => {
    const ms = findMentions("Flood in East Delta", dataset);
    expect(ms.map((m) => m.kind)).toEqual(["place"]);
  });
  it("negation: 'not IonPeak Semiconductor' is not a mention of IonPeak", () => {
    const ms = findMentions("a broker, not IonPeak Semiconductor", dataset);
    expect(ms[0].negated).toBe(true);
  });
});
