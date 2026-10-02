"use client";

import Link from "next/link";
import { useMemo } from "react";
import { LevelChip } from "@/components/alerts/LevelChip";
import { BAND_VAR, BandChip, ConfidenceMarker } from "@/components/ui/marks";
import { useAlertFeed } from "@/lib/alertStore";
import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import { fmtNum, fmtPct } from "@/lib/format";
import { buildGraph } from "@/lib/graph";
import { headline, kpis } from "@/lib/overview";
import { passesFilters, useFilters } from "@/lib/store";
import { useModel } from "@/lib/weights";

export function OverviewView() {
  const { model } = useModel();
  const feed = useAlertFeed();
  const filters = useFilters();
  const open = useDrawer((s) => s.open);
  const h = headline(model, feed, dataset);
  const k = kpis(model, feed, dataset);
  const top10 = [...model.scored].filter((n) => passesFilters(n, filters)).sort((a, b) => a.rank - b.rank).slice(0, 10);
  const maxP = Math.max(...model.scored.map((n) => n.priority));
  const alertOrder = { HIGH: 0, MEDIUM: 1, "LOW – verify": 2, "LOG only": 3, MERGED: 4, "SUPPRESS – stale": 5, "SUPPRESS – wrong entity": 6 } as const;
  const alerts = [...feed].sort((a, b) => alertOrder[a.alert.level] - alertOrder[b.alert.level] || b.alert.score - a.alert.score).slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Headline banner */}
      <section className="border-l-4 border-accent pl-4">
        <p className="serif text-2xl leading-snug">
          {h.place ? `${h.place} (${h.zone})` : h.zone} sits behind {fmtPct(h.share, 0)} of revenue — USD {fmtNum(h.weekly, 1)}m / week.
          {h.alert && (
            <>
              {" "}
              <button className="underline decoration-accent underline-offset-4" onClick={() => open({ kind: "event", id: h.alert!.event.id })}>
                {h.alert.event.title} active ({h.alert.event.id})
              </button>
              .
            </>
          )}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Confirmed sole-source dependencies only.
          {h.otherFullZones.length > 0 && ` ${h.otherFullZones.join(", ")} is a second zone that could stop all revenue.`} Network, scores and alerts as at the case cut-off.
        </p>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-2 border-y hairline lg:grid-cols-4">
        <Kpi
          label="Revenue exposed to Critical nodes"
          value={`USD ${fmtNum(k.criticalRevenue, 0)}m`}
          sub={`${fmtPct(k.criticalShare, 0)} of revenue · ${k.criticalCount} Critical nodes`}
          href="/scorecard"
        />
        <Kpi label="Active HIGH alerts" value={String(k.highAlerts)} sub="after de-duplication and entity checks" href="/alerts" />
        <Kpi
          label="Nodes by confidence"
          value={
            <span className="flex items-baseline gap-3">
              {(["High", "Medium", "Low"] as const).map((l) => (
                <span key={l} className="inline-flex items-center gap-1">
                  <ConfidenceMarker label={l} size={12} />
                  {k.confidence[l]}
                </span>
              ))}
            </span>
          }
          sub="High · Medium · Low (separate from risk)"
          href="/evidence"
        />
        <Kpi
          label="Real independent sources, power assemblies"
          value={`${fmtNum(k.power.real, 1)}`}
          sub={`vs ${fmtNum(k.power.apparent, 2)} apparent (${k.power.component}): one owner, one die fab`}
          href="/concentration"
        />
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
        {/* Top 10 */}
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="serif text-lg">Top-10 priority nodes</h2>
            <Link href="/scorecard" className="text-xs text-muted underline">
              Full scorecard
            </Link>
          </div>
          <ol className="border-t hairline">
            {top10.map((n) => (
              <li key={n.id} className="border-b hairline">
                <button
                  onClick={() => open({ kind: "node", id: n.id })}
                  className="grid w-full grid-cols-[24px_1fr_96px_74px] items-center gap-3 py-2 text-left text-[13px] hover:bg-paper-2 sm:grid-cols-[24px_1fr_120px_80px_90px_150px]"
                >
                  <span className="num text-muted">{n.rank}</span>
                  <span>
                    {n.name.replace(/ Ltd\.$/, "")}
                    <span className="block text-xs text-muted">
                      T{n.input.tier} · {n.input.zone}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="num w-8 text-right">{fmtNum(n.priority)}</span>
                    <span className="h-1.5 flex-1 bg-paper-2">
                      <span className="block h-1.5" style={{ width: `${(n.priority / maxP) * 100}%`, background: BAND_VAR[n.band] }} />
                    </span>
                  </span>
                  <BandChip band={n.band} />
                  <span className="hidden sm:inline">
                    <ConfidenceMarker label={n.confidence.label} showText />
                  </span>
                  <span className="hidden text-xs sm:inline">{n.actionLabel.split(" – ")[0]}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-8">
          {/* Live alerts */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="serif text-lg">Live alerts</h2>
              <Link href="/alerts" className="text-xs text-muted underline">
                Feed and simulator
              </Link>
            </div>
            <ul className="space-y-3">
              {alerts.map((f) => (
                <li key={f.event.id}>
                  <button onClick={() => open({ kind: "event", id: f.event.id })} className="w-full text-left">
                    <span className="flex items-center gap-2">
                      <LevelChip level={f.alert.level} label={f.alert.levelLabel} provisional={f.provisional} />
                      <span className="text-[13px]">
                        <span className="num text-muted">{f.event.id}</span> {f.event.title}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{firstSentence(f.card.why)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <MiniNetwork />
        </div>
      </div>
    </div>
  );
}

const firstSentence = (s: string) => {
  const m = s.match(/^.*?[.;](\s|$)/);
  return (m ? m[0] : s).trim();
};

function Kpi({ label, value, sub, href }: { label: string; value: React.ReactNode; sub: string; href: string }) {
  return (
    <Link href={href} className="block border-r hairline px-4 py-3 last:border-r-0 hover:bg-paper-2">
      <span className="label block">{label}</span>
      <span className="num serif mt-1 block text-3xl">{value}</span>
      <span className="mt-0.5 block text-xs text-muted">{sub}</span>
    </Link>
  );
}

/** Thumbnail of the network with the headline zone highlighted. */
function MiniNetwork() {
  const { model } = useModel();
  const feed = useAlertFeed();
  const h = headline(model, feed, dataset);
  const g = useMemo(() => buildGraph(dataset, model), [model]);
  const nodes = g.nodes.filter((n) => !n.trapOnly && (n.kind === "supplier" || n.kind === "product"));
  const maxY = Math.max(...nodes.map((n) => n.y));
  const sx = (x: number) => 20 + (x / 810) * 300;
  const sy = (y: number) => 14 + (y / maxY) * 170;
  const pos = new Map(nodes.map((n) => [n.id, n]));
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="serif text-lg">Network at a glance</h2>
        <Link href={`/network?zone=${h.zone}`} className="text-xs text-muted underline">
          Open the map
        </Link>
      </div>
      <Link href={`/network?zone=${h.zone}`} aria-label={`Open the network filtered to ${h.zone}`}>
        <svg viewBox="0 0 340 200" className="w-full border hairline hover:border-ink">
          {g.edges
            .filter((e) => !e.trapOnly && pos.has(e.source) && pos.has(e.target))
            .map((e) => {
              const a = pos.get(e.source)!;
              const b = pos.get(e.target)!;
              const hot = a.zone === h.zone;
              return (
                <line
                  key={e.id}
                  x1={sx(a.x)}
                  y1={sy(a.y)}
                  x2={sx(b.x)}
                  y2={sy(b.y)}
                  stroke={hot ? "var(--color-accent)" : "var(--color-rule)"}
                  strokeWidth={hot ? 1.2 : 0.7}
                />
              );
            })}
          {nodes.map((n) => {
            const hot = n.zone === h.zone;
            return n.kind === "product" ? (
              <rect key={n.id} x={sx(n.x) - 4} y={sy(n.y) - 4} width={8} height={8} fill="var(--color-ink)" />
            ) : (
              <circle key={n.id} cx={sx(n.x)} cy={sy(n.y)} r={hot ? 4.5 : 3} fill={hot ? "var(--color-accent)" : "var(--color-watch)"} />
            );
          })}
        </svg>
      </Link>
      <p className="mt-1 text-xs text-muted">
        {h.zone} nodes in teal: {model.zones.find((z) => z.zone === h.zone)?.nodeIds.map((id) => model.byId.get(id)?.name.split(" ")[0]).join(", ")}.
      </p>
    </section>
  );
}
