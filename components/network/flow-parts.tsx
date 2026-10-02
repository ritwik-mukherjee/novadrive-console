"use client";

import { BaseEdge, EdgeLabelRenderer, Handle, Position, getBezierPath, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { BAND_VAR, ConfidenceMarker } from "@/components/ui/marks";
import { fmtNum } from "@/lib/format";
import type { GEdge, GNode } from "@/lib/graph";
import type { Link } from "@/lib/types";

export interface NodeData extends Record<string, unknown> {
  g: GNode;
  dim: boolean;
  hot: boolean;
  zoneOverlay: boolean;
  zone100: boolean;
}
export type FlowNode = Node<NodeData>;

export interface EdgeData extends Record<string, unknown> {
  g: GEdge;
  link: Link;
  dim: boolean;
  hot: boolean;
}
export type FlowEdge = Edge<EdgeData>;

const hidden = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 } as const;

function ZoneTag({ zone, strong }: { zone: string | null; strong: boolean }) {
  if (!zone) return null;
  return (
    <span className={`num mt-0.5 inline-block border px-1 text-[10px] ${strong ? "border-accent text-accent" : "hairline text-muted"}`}>
      {zone}
      {strong ? " · 100% of revenue" : ""}
    </span>
  );
}

export function SupplierNode({ data }: NodeProps<FlowNode>) {
  const { g, dim, hot, zoneOverlay, zone100 } = data;
  const n = g.scored!;
  return (
    <div className="flex w-[150px] flex-col items-center text-center" style={{ opacity: dim ? 0.14 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ ...hidden, top: g.size / 2 }} />
      <div
        className="relative"
        style={{
          width: g.size,
          height: g.size,
          borderRadius: "50%",
          background: BAND_VAR[n.band],
          outline: hot ? "2px solid var(--color-accent)" : "none",
          outlineOffset: 2,
        }}
        title={`${n.name} · ${n.band} · ${n.confidence.label} confidence`}
      >
        <span className="num absolute inset-0 flex items-center justify-center text-[10px] text-ink">{n.rank}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ ...hidden, top: g.size / 2 }} />
      <div className="mt-1 flex items-center gap-1 text-[11.5px] leading-tight text-ink">
        <ConfidenceMarker label={n.confidence.label} size={9} />
        <span>{g.label.replace(/ (Semiconductor|Printed Circuits|Silicon Carbide|Process Gases|Specialty Minerals|Copper Foil|Control Electronics|Power Assemblies|Power Systems|Battery Controls|Thermal Systems|Thermal Metals|Electronics|Enclosures|Connectors|Dielectrics|Magnetics|Microdevices|Ceramics|Foils|Alloy|Resin|Polymer|Capacitor Works)$/, "")}</span>
      </div>
      <div className="text-[10px] text-muted">
        {n.band} · T{n.input.tier}
      </div>
      {zoneOverlay && <ZoneTag zone={g.zone} strong={zone100} />}
    </div>
  );
}

export function ProductNode({ data }: NodeProps<FlowNode>) {
  const { g, dim, hot } = data;
  return (
    <div
      className={`w-[150px] border bg-paper px-3 py-2 ${hot ? "border-accent" : "border-ink"}`}
      style={{ opacity: dim ? 0.14 : 1 }}
    >
      <Handle type="target" position={Position.Left} style={{ ...hidden, top: "50%" }} />
      <div className="serif text-[13px]">{g.label}</div>
      <div className="num text-[10.5px] text-muted">{g.sub}</div>
    </div>
  );
}

export function SideNode({ data }: NodeProps<FlowNode>) {
  const { g, dim } = data;
  const isTrap = g.kind === "trap" || g.kind === "novadrive";
  return (
    <div className="flex w-[150px] flex-col items-center text-center" style={{ opacity: dim ? 0.14 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ ...hidden, top: 6 }} />
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          border: `1.5px ${g.kind === "hypothesis" ? "dotted" : "solid"} ${isTrap ? "var(--color-critical)" : "var(--color-muted)"}`,
          background: "var(--color-paper)",
        }}
      />
      <Handle type="source" position={Position.Right} style={{ ...hidden, top: 6 }} />
      <div className={`mt-1 text-[11px] leading-tight ${isTrap ? "text-critical line-through" : "text-muted"}`}>{g.label}</div>
      <div className="text-[10px] text-muted">{g.kind === "hypothesis" ? "hypothesis" : isTrap ? "rejected trap" : g.sub}</div>
    </div>
  );
}

export function BracketNode({ data }: NodeProps<FlowNode>) {
  const { g, dim, hot } = data;
  const n = g.scored!;
  return (
    <div
      className="pointer-events-auto relative w-[194px] cursor-pointer border border-dashed"
      style={{ height: g.size, opacity: dim ? 0.2 : 1, borderColor: hot ? "var(--color-accent)" : "var(--color-muted)" }}
      title="CommonSpan Holdings owns both assemblers: the M10/M20 dual source is one ownership group"
    >
      <div className="absolute -top-[30px] left-0 w-[260px] text-left leading-tight">
        <div className="text-[11px] text-ink">
          {g.label} · <span className="text-muted">group owner</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted">
          <ConfidenceMarker label={n.confidence.label} size={8} />
          {n.band} · {g.sub}
        </div>
      </div>
    </div>
  );
}

const STROKE: Record<GEdge["style"], { color: string; dash?: string }> = {
  confirmed: { color: "var(--color-ink)" },
  inferred: { color: "var(--color-ink)", dash: "6 4" },
  hypothesis: { color: "var(--color-muted)", dash: "1.5 4" },
  context: { color: "var(--color-muted)", dash: "3 3" },
  rejected: { color: "var(--color-critical)", dash: "4 3" },
  collision: { color: "var(--color-critical)", dash: "4 3" },
};

export function RiskEdge(props: EdgeProps<FlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [hover, setHover] = useState(false);
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  const { g, link, dim, hot } = data;
  const s = STROKE[g.style];
  const opacity = dim ? 0.06 : g.style === "confirmed" || g.style === "inferred" ? 0.5 : 0.9;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={14}
        style={{
          stroke: hot ? "var(--color-accent)" : s.color,
          strokeWidth: hot ? Math.max(g.width, 1.5) : g.width,
          strokeDasharray: s.dash,
          opacity: hot ? 0.95 : opacity,
        }}
      />
      <path d={path} fill="none" stroke="transparent" strokeWidth={14} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />
      {hover && !dim && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute z-10 max-w-[260px] border border-ink bg-paper px-2 py-1.5 text-[11px] leading-snug"
            style={{ transform: `translate(-50%, -110%) translate(${lx}px, ${ly}px)` }}
          >
            <div className="font-medium">
              {link.id} · {g.label}
              {g.product ? ` → ${g.product}` : ""}
            </div>
            <div className="text-muted">
              {link.siteId ?? "—"} · {link.zone ?? "—"} · {link.status}
              {link.grade ? ` · grade ${link.grade}` : ""}
              {link.allocation !== null ? ` · allocation ${fmtNum(link.allocation * 100, 0)}%` : ""}
            </div>
            {g.revenue > 0 && <div className="num">USD {fmtNum(g.revenue, 0)}m / yr flows through this link</div>}
            <div className="text-muted">Evidence: {link.evidence.map((e) => e.id).join(", ") || "—"}</div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
