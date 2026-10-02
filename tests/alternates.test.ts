import { describe, expect, it } from "vitest";
import { classifyRoute, componentsForNode, nodesForAlternate, toCsv, viewCandidate } from "@/lib/alternates";
import { dataset } from "@/lib/data";
import { buildModel } from "@/lib/engine";

const model = buildModel(dataset);
const nodesOf = (n: number) => nodesForAlternate(dataset.alternates.find((a) => a.n === n)!, dataset, model).sort();

describe("Alternates mapping", () => {
  it("maps every curated candidate to at least one flagged node", () => {
    for (const a of dataset.alternates) expect(nodesForAlternate(a, dataset, model).length, a.trigger).toBeGreaterThan(0);
  });
  it("maps triggers to the right nodes", () => {
    expect(nodesOf(1)).toEqual(["ORG-439"]); // IonPeak dies
    expect(nodesOf(6)).toEqual(["ORG-268"]); // CommonSpan group
    expect(nodesOf(9)).toEqual(["ORG-210", "ORG-922"]); // Meridian film / Delta
    expect(nodesOf(15)).toEqual(["ORG-453"]); // Jade substrates
    expect(nodesOf(27)).toEqual(["ORG-103", "ORG-176"]); // Grove/HarborSense B10 (not Jade)
  });
  it("IonPeak's shortlist is Infineon 90, Mitsubishi 81, Fuji 78 (+ Vincotech, Wolfspeed)", () => {
    const rows = dataset.alternates
      .map((a) => viewCandidate(a, dataset, model, {}, {}))
      .filter((v) => v.nodes.includes("ORG-439") && v.recommendation.startsWith("SHORTLIST"))
      .sort((a, b) => b.fit - a.fit);
    expect(rows.slice(0, 3).map((r) => [r.alt.candidate.split(" ")[0], Math.round(r.fit)])).toEqual([
      ["Infineon", 90],
      ["Mitsubishi", 81],
      ["Fuji", 78],
    ]);
  });
  it("prefills the components a node feeds", () => {
    expect(componentsForNode("ORG-439", dataset).map((c) => c.id)).toEqual(["M10", "M20"]);
    expect(componentsForNode("ORG-453", dataset).map((c) => c.id).sort()).toEqual(["B10", "C10"]);
    expect(componentsForNode("ORG-268", dataset).map((c) => c.id)).toEqual(["M10", "M20"]);
  });
  it("classifies routes", () => {
    expect(classifyRoute("Platform redesign: buy finished charging power modules")).toBe("platform");
    expect(classifyRoute("Tier-2 second source (via Delta)")).toBe("sub-tier");
    expect(classifyRoute("Tier-1 swap (fastest hedge: 8-wk qual)")).toBe("same-tier");
  });
  it("independence toggle excludes a candidate whatever its fitment", () => {
    const infineon = dataset.alternates.find((a) => a.n === 1)!;
    expect(viewCandidate(infineon, dataset, model, {}, { "1": true }).recommendation).toMatch(/not independent/);
  });
  it("CSV export carries every field and the source", () => {
    const csv = toCsv(dataset.alternates.map((a) => viewCandidate(a, dataset, model, {}, {})), "test");
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2 + 28);
    expect(lines[1]).toContain("Source date");
    expect(csv).toContain("https://www.infineon.com/");
  });
});
