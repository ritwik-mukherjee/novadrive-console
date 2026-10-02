import { describe, expect, it } from "vitest";
import { dataset } from "@/lib/data";
import { buildModel } from "@/lib/engine";
import { buildGraph, traceDownstream, traceUpstream } from "@/lib/graph";

const model = buildModel(dataset);
const g = buildGraph(dataset, model);

describe("Network graph", () => {
  it("draws 24 scored suppliers, 3 products and CommonSpan as a bracket around Aster and Boreal", () => {
    expect(g.nodes.filter((n) => n.kind === "supplier")).toHaveLength(24);
    expect(g.nodes.filter((n) => n.kind === "product").map((n) => n.id)).toEqual(["P1", "P2", "P3"]);
    expect(g.brackets.map((b) => b.id)).toEqual(["ORG-268"]);
    const aster = g.nodes.find((n) => n.id === "ORG-247")!;
    const boreal = g.nodes.find((n) => n.id === "ORG-725")!;
    expect(Math.abs(aster.y - boreal.y)).toBeLessThan(100); // adjacent rows inside the bracket
  });

  it("styles links by status: inferred Verdant, hypothesis Solace/Alder, traps only when toggled", () => {
    expect(g.edges.find((e) => e.linkId === "L28")!.style).toBe("inferred");
    expect(g.edges.filter((e) => e.style === "hypothesis").map((e) => e.linkId).sort()).toEqual(["L33", "L34"]);
    const traps = g.edges.filter((e) => e.trapOnly);
    expect(traps.map((e) => e.linkId).sort()).toEqual(["L39", "L40", "L41"]);
    expect(traps.find((e) => e.linkId === "L41")!.target).toBe("ORG-439"); // Ion Peak Trading ≠ IonPeak
  });

  it("edge thickness follows revenue: Cobalt C10 → P1 carries USD 624m", () => {
    const e = g.edges.find((x) => x.id === "L05-P1")!;
    expect(e.revenue).toBeCloseTo(624, 6);
  });

  it("trace upstream of P2 reaches Aster, Boreal, IonPeak and Umber", () => {
    const t = traceUpstream(g.edges, dataset, { product: "P2" });
    for (const id of ["ORG-247", "ORG-725", "ORG-439", "ORG-455", "ORG-736"]) expect(t.nodes.has(id)).toBe(true);
    expect(t.nodes.has("ORG-287")).toBe(false); // ForgeLine H10 is P1 only
  });

  it("trace upstream of component B10 follows only B10 sub-tier inputs", () => {
    const t = traceUpstream(g.edges, dataset, { component: "B10" });
    expect(t.nodes.has("ORG-453")).toBe(true); // Jade substrates → B10
    expect(t.nodes.has("ORG-469")).toBe(false); // Rill connectors feed C10 only
  });

  it("trace downstream: IonPeak can stop all three products; Meridian stops P1 and P2 only", () => {
    const ion = traceDownstream(g.edges, dataset, "ORG-439");
    expect(["P1", "P2", "P3"].every((p) => ion.nodes.has(p))).toBe(true);
    const mer = traceDownstream(g.edges, dataset, "ORG-210");
    expect(mer.nodes.has("P1") && mer.nodes.has("P2")).toBe(true);
    expect(mer.nodes.has("P3")).toBe(false);
  });

  it("trace downstream of the group node runs through its members", () => {
    const t = traceDownstream(g.edges, dataset, "ORG-268");
    expect(t.nodes.has("ORG-247") && t.nodes.has("ORG-725") && t.nodes.has("P2")).toBe(true);
  });
});
