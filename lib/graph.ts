/**
 * Network graph model: which nodes and edges to draw, where, and how thick.
 * Pure (no React Flow types) so the layout and dependency tracing are testable.
 */
import type { Model, ScoredNode } from "./engine";
import { PRODUCT_IDS, type Dataset, type Link, type ProductId } from "./types";

export type GNodeKind = "supplier" | "product" | "context" | "hypothesis" | "trap" | "novadrive" | "bracket";

export interface GNode {
  id: string;
  kind: GNodeKind;
  label: string;
  sub: string;
  column: number; // 0 = Tier-3 ... 3 = products
  x: number;
  y: number;
  size: number; // circle diameter
  scored?: ScoredNode;
  zone: string | null;
  linkId?: string; // context/trap nodes open their link
  trapOnly: boolean;
}

export type GEdgeStyle = "confirmed" | "inferred" | "hypothesis" | "context" | "rejected" | "collision";

export interface GEdge {
  id: string;
  linkId: string;
  source: string;
  target: string;
  style: GEdgeStyle;
  revenue: number; // USD m / yr flowing through this edge
  width: number;
  label: string; // input / component
  product?: ProductId;
  trapOnly: boolean;
}

export const COLUMN_X = [0, 270, 540, 810];
const ROW_GAP = 74;
const NOVADRIVE = "NOVADRIVE";

const short = (name: string) => name.replace(/ (Ltd\.|LTD|Inc\.)$/, "").replace(/ \(not in universe\)/, "");

export function nodeSize(revenue: number, total: number) {
  return 16 + 30 * Math.sqrt(Math.max(0, revenue) / total);
}

export function edgeWidth(revenue: number, total: number) {
  return 1 + 7 * (revenue / total);
}

export function buildGraph(data: Dataset, model: Model) {
  const total = data.assumptions.totalRevenue;
  const rev = Object.fromEntries(data.products.map((p) => [p.id, p.revenue])) as Record<ProductId, number>;
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const colOf = (tier: number) => 3 - tier;

  // Products
  for (const p of data.products) {
    nodes.set(p.id, {
      id: p.id,
      kind: "product",
      label: `${p.id} ${p.name.split(" ")[0]}`,
      sub: `USD ${p.revenue}m / yr`,
      column: 3,
      x: COLUMN_X[3],
      y: 0,
      size: 0,
      zone: null,
      trapOnly: false,
    });
  }

  // Scored suppliers (the group node is drawn as a bracket instead)
  for (const n of model.scored) {
    if (n.kind === "group") continue;
    nodes.set(n.id, {
      id: n.id,
      kind: "supplier",
      label: short(n.name),
      sub: `T${n.input.tier} · ${n.input.zone}`,
      column: colOf(n.input.tier),
      x: COLUMN_X[colOf(n.input.tier)],
      y: 0,
      size: nodeSize(n.revenueExposed, total),
      scored: n,
      zone: n.input.zone,
      trapOnly: false,
    });
  }

  const entity = (id: string) => data.entities.find((e) => e.id === id);
  const ensureSide = (l: Link, kind: GNodeKind, trapOnly: boolean, columnHint: number) => {
    if (nodes.has(l.supplierId)) return;
    nodes.set(l.supplierId, {
      id: l.supplierId,
      kind,
      label: short(l.supplierName),
      sub: [l.type, l.zone].filter(Boolean).join(" · "),
      column: columnHint,
      x: COLUMN_X[columnHint],
      y: 0,
      size: 12,
      zone: l.zone ?? entity(l.supplierId)?.facilityZone ?? null,
      linkId: l.id,
      trapOnly,
    });
  };

  for (const l of data.links) {
    const customerCol = l.customerId ? (nodes.get(l.customerId)?.column ?? 3) : 3;
    const label = l.input;

    if (l.supplierTier === 1 && l.include) {
      for (const p of PRODUCT_IDS) {
        if (!l.productFlags[p]) continue;
        const r = (l.allocation ?? 0) * rev[p];
        edges.push({
          id: `${l.id}-${p}`,
          linkId: l.id,
          source: l.supplierId,
          target: p,
          style: l.status === "Inferred" ? "inferred" : "confirmed",
          revenue: r,
          width: edgeWidth(r, total),
          label,
          product: p,
          trapOnly: false,
        });
      }
      continue;
    }
    if (l.supplierTier !== null && l.include && l.customerId) {
      const cust = model.byId.get(l.customerId);
      const r = cust ? cust.revenueExposed : 0;
      edges.push({
        id: l.id,
        linkId: l.id,
        source: l.supplierId,
        target: l.customerId,
        style: l.status === "Inferred" ? "inferred" : "confirmed",
        revenue: r,
        width: edgeWidth(r, total),
        label,
        trapOnly: false,
      });
      continue;
    }
    if (l.type === "Ownership" && model.byId.get(l.supplierId)?.kind === "group") continue; // shown as bracket
    if (l.type === "Ownership" || l.type === "Logistics") {
      ensureSide(l, "context", false, Math.max(0, customerCol - 1));
      edges.push({ id: l.id, linkId: l.id, source: l.supplierId, target: l.customerId!, style: "context", revenue: 0, width: 1, label, trapOnly: false });
      continue;
    }
    if (l.status === "Hypothesis") {
      ensureSide(l, "hypothesis", false, Math.max(0, customerCol - 1));
      edges.push({ id: l.id, linkId: l.id, source: l.supplierId, target: l.customerId!, style: "hypothesis", revenue: 0, width: 1, label, trapOnly: false });
      continue;
    }
    if (l.status === "Rejected") {
      if (l.customerId === NOVADRIVE) {
        if (!nodes.has(NOVADRIVE)) {
          nodes.set(NOVADRIVE, {
            id: NOVADRIVE,
            kind: "novadrive",
            label: "NovaDrive (non-production)",
            sub: "rejected claims only",
            column: 3,
            x: COLUMN_X[3],
            y: 0,
            size: 0,
            zone: null,
            trapOnly: true,
          });
        }
        if (!model.byId.has(l.supplierId)) ensureSide(l, "trap", true, 2);
        edges.push({ id: l.id, linkId: l.id, source: l.supplierId, target: NOVADRIVE, style: "rejected", revenue: 0, width: 1, label, trapOnly: true });
      } else {
        // Name collision with no relationship at all (Ion Peak Trading vs IonPeak)
        ensureSide(l, "trap", true, 1);
        const lookalike = model.scored.find(
          (n) => n.id !== l.supplierId && n.name.replace(/\s/g, "").slice(0, 6).toLowerCase() === l.supplierName.replace(/\s/g, "").slice(0, 6).toLowerCase(),
        );
        if (lookalike) {
          edges.push({
            id: `${l.id}-collision`,
            linkId: l.id,
            source: l.supplierId,
            target: lookalike.id,
            style: "collision",
            revenue: 0,
            width: 1,
            label: "Name collision only – no relationship",
            trapOnly: true,
          });
        }
      }
    }
  }

  const groups = model.scored
    .filter((n) => n.kind === "group")
    .map((g) => data.links.filter((l) => l.type === "Ownership" && l.supplierId === g.id).map((l) => l.customerId!));
  layout(nodes, edges, groups);

  // CommonSpan bracket around its members
  const brackets: GNode[] = [];
  for (const n of model.scored) {
    if (n.kind !== "group") continue;
    const members = data.links.filter((l) => l.type === "Ownership" && l.supplierId === n.id).map((l) => nodes.get(l.customerId!)).filter(Boolean) as GNode[];
    if (members.length === 0) continue;
    const ys = members.map((m) => m.y);
    brackets.push({
      id: n.id,
      kind: "bracket",
      label: short(n.name),
      sub: "common owner of both (DOC-075)",
      column: members[0].column,
      x: members[0].x,
      y: Math.min(...ys) - 34,
      size: Math.max(...ys) - Math.min(...ys) + 96, // height
      scored: n,
      zone: n.input.zone,
      trapOnly: false,
    });
  }

  return { nodes: [...nodes.values()], edges, brackets };
}

/** Barycentric column ordering right-to-left, so links mostly run straight. */
function layout(nodes: Map<string, GNode>, edges: GEdge[], groups: string[][]) {
  const byCol = (c: number) => [...nodes.values()].filter((n) => n.column === c);
  // Owner-group members get extra room above and below for the bracket and its label
  const inGroup = (id: string) => groups.some((g) => g.includes(id));
  const place = (list: GNode[]) => {
    let y = 0;
    list.forEach((n, i) => {
      const prevIn = i > 0 && inGroup(list[i - 1].id);
      if (inGroup(n.id) && !prevIn && i > 0) y += 34;
      if (!inGroup(n.id) && prevIn) y += 20;
      n.y = y;
      y += ROW_GAP;
    });
  };
  const productRank = (id: string) => ["P1", "P2", "P3", NOVADRIVE].indexOf(id);

  place(byCol(3).sort((a, b) => productRank(a.id) - productRank(b.id)));
  for (const col of [2, 1, 0]) {
    const list = byCol(col);
    const bary = (n: GNode) => {
      const ys = edges.filter((e) => e.source === n.id).map((e) => nodes.get(e.target)?.y ?? 0);
      return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : Number.MAX_SAFE_INTEGER;
    };
    const order = (n: GNode) => (n.kind === "supplier" ? 0 : n.kind === "context" || n.kind === "hypothesis" ? 1 : 2);
    list.sort((a, b) => order(a) - order(b) || bary(a) - bary(b) || (b.scored?.priority ?? 0) - (a.scored?.priority ?? 0));
    // Keep owner-group members adjacent (Aster + Boreal under CommonSpan)
    for (const g of groups) {
      const members = list.filter((n) => g.includes(n.id));
      if (members.length > 1) {
        const first = list.indexOf(members[0]);
        for (const m of members.slice(1)) {
          list.splice(list.indexOf(m), 1);
          list.splice(first + 1, 0, m);
        }
      }
    }
    place(list);
  }
  // Centre columns vertically against the tallest one
  const heights = [0, 1, 2, 3].map((c) => byCol(c).length);
  const maxH = Math.max(...heights);
  for (const n of nodes.values()) n.y += ((maxH - heights[n.column]) * ROW_GAP) / 2;
}

// ---------------------------------------------------------------------------
// Dependency tracing
// ---------------------------------------------------------------------------

export interface Trace {
  nodes: Set<string>;
  edges: Set<string>;
}

/** Everything upstream of a product (or of a component across all products). */
export function traceUpstream(edges: GEdge[], data: Dataset, start: { product?: ProductId; component?: string }): Trace {
  const t: Trace = { nodes: new Set(), edges: new Set() };
  const live = edges.filter((e) => !e.trapOnly && e.style !== "context" && e.style !== "hypothesis");
  let frontier: string[] = [];
  for (const e of live) {
    if (!e.product) continue;
    const link = data.links.find((l) => l.id === e.linkId)!;
    if (start.product && e.product !== start.product) continue;
    if (start.component && link.input !== start.component) continue;
    t.edges.add(e.id);
    t.nodes.add(e.target);
    t.nodes.add(e.source);
    frontier.push(e.source);
  }
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of live) {
        if (e.target !== id || e.product) continue;
        if (start.component) {
          const link = data.links.find((l) => l.id === e.linkId)!;
          const feeds = link.input.split("→")[1]?.split("/").map((s) => s.trim()) ?? [];
          if (link.supplierTier === 2 && !feeds.includes(start.component)) continue;
        }
        if (!t.edges.has(e.id)) {
          t.edges.add(e.id);
          if (!t.nodes.has(e.source)) next.push(e.source);
          t.nodes.add(e.source);
        }
      }
    }
    frontier = next;
  }
  return t;
}

/** Everything a node's failure could stop: customers up to products. */
export function traceDownstream(edges: GEdge[], data: Dataset, nodeId: string): Trace {
  const t: Trace = { nodes: new Set([nodeId]), edges: new Set() };
  const live = edges.filter((e) => !e.trapOnly && e.style !== "context" && e.style !== "hypothesis");
  // A group node fails through its members
  const members = data.links.filter((l) => l.type === "Ownership" && l.supplierId === nodeId).map((l) => l.customerId!);
  let frontier = [nodeId, ...members];
  members.forEach((m) => t.nodes.add(m));
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of live) {
        if (e.source !== id || t.edges.has(e.id)) continue;
        t.edges.add(e.id);
        if (!t.nodes.has(e.target)) next.push(e.target);
        t.nodes.add(e.target);
      }
    }
    frontier = next;
  }
  return t;
}
