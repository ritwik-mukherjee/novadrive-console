"use client";

import "@xyflow/react/dist/style.css";
import { Controls, ReactFlow, ReactFlowProvider, ViewportPortal } from "@xyflow/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { BandChip } from "@/components/ui/marks";
import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import type { Band, ConfidenceLabel } from "@/lib/engine";
import { COLUMN_X, buildGraph, traceDownstream, traceUpstream, type GEdgeStyle, type Trace } from "@/lib/graph";
import { passesFilters, useFilters } from "@/lib/store";
import type { ProductId } from "@/lib/types";
import { useModel } from "@/lib/weights";
import { BracketNode, ProductNode, RiskEdge, SideNode, SupplierNode, type FlowEdge, type FlowNode } from "./flow-parts";

const nodeTypes = { supplier: SupplierNode, product: ProductNode, side: SideNode, bracket: BracketNode };
const edgeTypes = { risk: RiskEdge };

type TraceTarget = { kind: "product"; id: ProductId } | { kind: "component"; id: string } | { kind: "node"; id: string } | null;

const STATUS_OPTIONS: { id: GEdgeStyle; label: string }[] = [
  { id: "confirmed", label: "Confirmed" },
  { id: "inferred", label: "Inferred" },
  { id: "hypothesis", label: "Hypothesis" },
  { id: "context", label: "Context" },
];

export function NetworkView() {
  return (
    <ReactFlowProvider>
      <NetworkInner />
    </ReactFlowProvider>
  );
}

function NetworkInner() {
  const { model } = useModel();
  const filters = useFilters();
  const openDrawer = useDrawer((s) => s.open);
  const params = useSearchParams();
  const zoneParam = params.get("zone");

  const [component, setComponent] = useState<string>("all");
  const [band, setBand] = useState<Band | "all">("all");
  const [confidence, setConfidence] = useState<ConfidenceLabel | "all">("all");
  const [statuses, setStatuses] = useState<Set<GEdgeStyle>>(new Set(["confirmed", "inferred", "hypothesis", "context"]));
  const [showTraps, setShowTraps] = useState(false);
  const [traceMode, setTraceMode] = useState(false);
  const [trace, setTrace] = useState<TraceTarget>(null);
  const [zoneOverlay, setZoneOverlay] = useState(Boolean(zoneParam));

  const graph = useMemo(() => buildGraph(dataset, model), [model]);
  const zone100 = useMemo(
    () => new Set(model.zones.filter((z) => z.confirmedRevenue >= dataset.assumptions.totalRevenue - 1e-6).map((z) => z.zone)),
    [model],
  );
  const zoneFilter = zoneParam ?? (filters.zone !== "all" ? filters.zone : null);

  const traced: Trace | null = useMemo(() => {
    const t = trace ?? (component !== "all" ? ({ kind: "component", id: component } as const) : null);
    if (!t) return null;
    if (t.kind === "product") return traceUpstream(graph.edges, dataset, { product: t.id });
    if (t.kind === "component") return traceUpstream(graph.edges, dataset, { component: t.id });
    return traceDownstream(graph.edges, dataset, t.id);
  }, [trace, component, graph]);

  const { nodes, edges } = useMemo(() => {
    const nodeDim = (id: string) => {
      const g = graph.nodes.find((n) => n.id === id) ?? graph.brackets.find((b) => b.id === id);
      if (!g) return false;
      if (traced && g.kind !== "bracket" && !traced.nodes.has(id)) return true;
      if (g.scored) {
        const n = g.scored;
        if (!passesFilters(n, { product: filters.product, zone: zoneFilter ?? "all", tier: filters.tier })) return true;
        if (band !== "all" && n.band !== band) return true;
        if (confidence !== "all" && n.confidence.label !== confidence) return true;
      } else if (g.kind === "product") {
        if (filters.product !== "all" && g.id !== filters.product) return true;
      } else if (zoneFilter && g.zone !== zoneFilter) return true;
      return false;
    };

    const flowNodes: FlowNode[] = [
      ...graph.brackets.map((b) => ({
        id: b.id,
        type: "bracket",
        position: { x: b.x - 97, y: b.y },
        data: { g: b, dim: nodeDim(b.id), hot: trace?.kind === "node" && trace.id === b.id, zoneOverlay, zone100: false },
        zIndex: -1,
        selectable: true,
        draggable: false,
      })),
      ...graph.nodes
        .filter((g) => showTraps || !g.trapOnly)
        .map((g) => ({
          id: g.id,
          type: g.kind === "supplier" ? "supplier" : g.kind === "product" ? "product" : "side",
          position: { x: g.x - 75, y: g.y },
          data: {
            g,
            dim: nodeDim(g.id),
            hot: Boolean(traced?.nodes.has(g.id)),
            zoneOverlay,
            zone100: Boolean(g.zone && zone100.has(g.zone)),
          },
          draggable: false,
        })),
    ];
    const flowEdges: FlowEdge[] = graph.edges
      .filter((e) => (showTraps || !e.trapOnly) && (e.trapOnly || statuses.has(e.style)))
      .map((e) => {
        const link = dataset.links.find((l) => l.id === e.linkId)!;
        const dim = traced ? !traced.edges.has(e.id) : nodeDim(e.source) || nodeDim(e.target);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "risk",
          data: { g: e, link, dim, hot: Boolean(traced?.edges.has(e.id)) },
          zIndex: traced?.edges.has(e.id) ? 1 : 0,
        };
      });
    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, traced, trace, filters, zoneFilter, band, confidence, statuses, showTraps, zoneOverlay, zone100]);

  const onNodeClick = (_: unknown, node: FlowNode) => {
    const g = node.data.g;
    if (g.kind === "product") {
      setTrace((t) => (t?.kind === "product" && t.id === g.id ? null : { kind: "product", id: g.id as ProductId }));
      return;
    }
    if (traceMode && (g.kind === "supplier" || g.kind === "bracket")) {
      setTrace((t) => (t?.kind === "node" && t.id === g.id ? null : { kind: "node", id: g.id }));
      return;
    }
    if (g.kind === "supplier" || g.kind === "bracket") openDrawer({ kind: "node", id: g.id });
    else if (g.linkId) openDrawer({ kind: "link", id: g.linkId });
  };

  const traceText = (() => {
    const t = trace ?? (component !== "all" ? ({ kind: "component", id: component } as const) : null);
    if (!t || !traced) return null;
    const suppliers = [...traced.nodes].filter((id) => model.byId.has(id)).length;
    if (t.kind === "product") return `${t.id}: ${suppliers} suppliers upstream across ${traced.edges.size} links.`;
    if (t.kind === "component") return `${t.id}: ${suppliers} suppliers on its supply path.`;
    const n = model.byId.get(t.id);
    const prods = [...traced.nodes].filter((id) => /^P\d$/.test(id));
    return `${n?.name ?? t.id} can stop ${prods.join(", ") || "no product"} (${Math.round((n?.share ?? 0) * 100)}% of revenue).`;
  })();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 text-xs">
        <Select label="Component" value={component} onChange={(v) => { setComponent(v); setTrace(null); }}>
          <option value="all">All components</option>
          {dataset.components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} {c.name}
            </option>
          ))}
        </Select>
        <Select label="Band" value={band} onChange={(v) => setBand(v as Band | "all")}>
          <option value="all">All bands</option>
          {(["Critical", "High", "Elevated", "Watch"] as Band[]).map((b) => (
            <option key={b}>{b}</option>
          ))}
        </Select>
        <Select label="Confidence" value={confidence} onChange={(v) => setConfidence(v as ConfidenceLabel | "all")}>
          <option value="all">All</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </Select>
        <fieldset className="flex items-center gap-2">
          <legend className="label mb-0.5">Link status</legend>
          {STATUS_OPTIONS.map((s) => (
            <label key={s.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={statuses.has(s.id)}
                onChange={() =>
                  setStatuses((cur) => {
                    const next = new Set(cur);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
                className="accent-[var(--color-accent)]"
              />
              {s.label}
            </label>
          ))}
        </fieldset>
        <Toggle on={traceMode} onClick={() => { setTraceMode((v) => !v); setTrace(null); }}>
          Trace dependency
        </Toggle>
        <Toggle on={zoneOverlay} onClick={() => setZoneOverlay((v) => !v)}>
          Zone overlay
        </Toggle>
        <Toggle on={showTraps} onClick={() => setShowTraps((v) => !v)} danger>
          Show rejected traps
        </Toggle>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {traceText ? (
            <span className="text-ink">
              {traceText}{" "}
              <button className="underline" onClick={() => { setTrace(null); setComponent("all"); }}>
                Clear trace
              </button>
            </span>
          ) : traceMode ? (
            "Trace mode: click a product to see everything upstream, or a supplier to see everything downstream it can stop."
          ) : (
            "Click a supplier for its evidence drawer; click a product to trace its upstream; hover a link for its evidence."
          )}
          {zoneParam && <span className="ml-2 text-ink">Filtered to zone {zoneParam}.</span>}
        </span>
        <Legend />
      </div>

      <div className="h-[calc(100vh-260px)] min-h-[560px] border hairline">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          onEdgeClick={(_, e) => e.data && openDrawer({ kind: "link", id: e.data.g.linkId })}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          minZoom={0.3}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} position="bottom-right" />
          <ColumnHeads />
        </ReactFlow>
      </div>
    </div>
  );
}

const COLUMN_HEADS = ["Tier-3 (raw materials)", "Tier-2 (sub-components)", "Tier-1 (direct suppliers)", "NovaDrive products"];

function ColumnHeads() {
  return (
    <ViewportPortal>
      {COLUMN_HEADS.map((h, i) => (
        <div key={h} className="label absolute w-[150px] whitespace-nowrap text-center" style={{ transform: `translate(${COLUMN_X[i] - 75}px, -56px)` }}>
          {h}
        </div>
      ))}
    </ViewportPortal>
  );
}

function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-3">
      {(["Critical", "High", "Elevated", "Watch"] as Band[]).map((b) => (
        <BandChip key={b} band={b} />
      ))}
      <span className="flex items-center gap-1">
        <svg width="26" height="6" aria-hidden>
          <line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-ink)" strokeWidth="2" />
        </svg>
        confirmed
      </span>
      <span className="flex items-center gap-1">
        <svg width="26" height="6" aria-hidden>
          <line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-ink)" strokeWidth="2" strokeDasharray="6 4" />
        </svg>
        inferred
      </span>
      <span className="flex items-center gap-1">
        <svg width="26" height="6" aria-hidden>
          <line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-muted)" strokeWidth="2" strokeDasharray="1.5 4" />
        </svg>
        hypothesis
      </span>
      <span>Size = revenue exposed · thickness = revenue flowing · number = rank</span>
    </span>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="border-b hairline bg-transparent py-1 pr-1">
        {children}
      </select>
    </label>
  );
}

function Toggle({ on, onClick, children, danger }: { on: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`border px-2 py-1 ${on ? (danger ? "border-critical text-critical" : "border-accent text-accent") : "hairline text-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
