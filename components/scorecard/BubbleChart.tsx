"use client";

import { BAND_VAR, halfDiscPath } from "@/components/ui/marks";
import { dataset } from "@/lib/data";
import type { ScoredNode } from "@/lib/engine";
import { fmtNum } from "@/lib/format";

const W = 640;
const H = 380;
const M = { l: 44, r: 16, t: 14, b: 36 };
const X = [20, 90] as const; // vulnerability
const Y = [10, 100] as const; // impact

const sx = (v: number) => M.l + ((v - X[0]) / (X[1] - X[0])) * (W - M.l - M.r);
const sy = (v: number) => H - M.b - ((v - Y[0]) / (Y[1] - Y[0])) * (H - M.t - M.b);
const clampX = (v: number) => Math.max(X[0], Math.min(X[1], v));
const clampY = (v: number) => Math.max(Y[0], Math.min(Y[1], v));

/** x = Vulnerability, y = Impact, size = revenue-at-risk, colour = band, fill = confidence. */
export function BubbleChart({
  nodes,
  onSelect,
  dimmed,
}: {
  nodes: ScoredNode[];
  onSelect: (id: string) => void;
  dimmed: (n: ScoredNode) => boolean;
}) {
  const { quadrant } = dataset.assumptions;
  const maxRar = Math.max(...nodes.map((n) => n.rar), 1);
  const radius = (rar: number) => 4 + 16 * Math.sqrt(rar / maxRar);
  const labelled = new Set([...nodes].sort((a, b) => a.rank - b.rank).slice(0, 8).map((n) => n.id));
  const qx = sx(quadrant.vulnHigh);
  const qy = sy(quadrant.impactHigh);
  // Draw big bubbles first so small ones stay clickable
  const ordered = [...nodes].sort((a, b) => b.rar - a.rar);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Impact versus vulnerability bubble chart">
        {/* gridlines */}
        {[20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={M.t} y2={H - M.b} stroke="var(--color-rule)" strokeWidth={0.5} />
            <text x={sx(v)} y={H - M.b + 14} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
              {v}
            </text>
          </g>
        ))}
        {[20, 40, 60, 80, 100].map((v) => (
          <g key={`y${v}`}>
            <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="var(--color-rule)" strokeWidth={0.5} />
            <text x={M.l - 6} y={sy(v) + 3} textAnchor="end" fontSize={10} fill="var(--color-muted)">
              {v}
            </text>
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
          Vulnerability (likelihood, 0-100)
        </text>
        <text x={12} y={(M.t + H - M.b) / 2} textAnchor="middle" fontSize={11} fill="var(--color-muted)" transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`}>
          Impact (0-100)
        </text>

        {/* quadrant lines */}
        <line x1={qx} x2={qx} y1={M.t} y2={H - M.b} stroke="var(--color-ink)" strokeWidth={0.6} strokeDasharray="3 3" opacity={0.5} />
        <line x1={M.l} x2={W - M.r} y1={qy} y2={qy} stroke="var(--color-ink)" strokeWidth={0.6} strokeDasharray="3 3" opacity={0.5} />
        {[
          ["ACT NOW", W - M.r - 4, M.t + 12, "end"],
          ["PROTECT (STRUCTURAL)", M.l + 4, M.t + 12, "start"],
          ["REMEDIATE SUPPLIER", W - M.r - 4, H - M.b - 6, "end"],
          ["ROUTINE", M.l + 4, H - M.b - 6, "start"],
        ].map(([t, x, y, a]) => (
          <text key={t as string} x={x as number} y={y as number} textAnchor={a as "start" | "end"} fontSize={10} letterSpacing="0.08em" fill="var(--color-muted)">
            {t}
          </text>
        ))}

        {ordered.map((n) => {
          const cx = sx(clampX(n.V));
          const cy = sy(clampY(n.I));
          const r = radius(n.rar);
          const col = BAND_VAR[n.band];
          const faded = dimmed(n);
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`${n.name}: V ${fmtNum(n.V)}, I ${fmtNum(n.I)}, ${n.band}, ${n.confidence.label} confidence`}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(n.id)}
              className="cursor-pointer focus:outline-none"
              opacity={faded ? 0.15 : 1}
            >
              <title>
                {`#${n.rank} ${n.name}\nV ${fmtNum(n.V)} · I ${fmtNum(n.I)} · Priority ${fmtNum(n.priority)}\n${n.band} · ${n.confidence.label} confidence · RaR USD ${fmtNum(n.rar, 0)}m`}
              </title>
              <circle cx={cx} cy={cy} r={r} fill={n.confidence.label === "High" ? col : "var(--color-paper)"} fillOpacity={n.confidence.label === "High" ? 0.85 : 1} />
              {n.confidence.label === "Medium" && <path d={halfDiscPath(cx, cy, r)} fill={col} fillOpacity={0.85} />}
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={1.5} />
            </g>
          );
        })}

        {/* labels on top; flip left when another bubble sits where the label would go */}
        {nodes
          .filter((n) => labelled.has(n.id))
          .map((n) => {
            const cx = sx(clampX(n.V));
            const cy = sy(clampY(n.I));
            const r = radius(n.rar);
            const blocked = nodes.some((o) => {
              if (o.id === n.id) return false;
              const ox = sx(clampX(o.V));
              const oy = sy(clampY(o.I));
              return ox > cx && ox - radius(o.rar) < cx + r + 52 && Math.abs(oy - cy) < radius(o.rar) + 6;
            });
            return (
              <text
                key={`l-${n.id}`}
                x={blocked ? cx - r - 3 : cx + r + 3}
                y={cy + 3}
                textAnchor={blocked ? "end" : "start"}
                fontSize={10.5}
                fill="var(--color-ink)"
                opacity={dimmed(n) ? 0.2 : 1}
                pointerEvents="none"
              >
                {n.name.split(" ")[0]}
              </text>
            );
          })}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">
        Bubble size = revenue-at-risk over time-to-recover. Colour = priority band. Fill = confidence: solid High, half Medium, hollow Low.
        Dashed lines at Impact {quadrant.impactHigh} and Vulnerability {quadrant.vulnHigh}.
      </figcaption>
    </figure>
  );
}
