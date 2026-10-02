"use client";

import Link from "next/link";
import { dataset } from "@/lib/data";
import { entityName } from "@/lib/evidence";
import { fmtNum, fmtPct } from "@/lib/format";
import { placeName } from "@/lib/overview";
import { useModel } from "@/lib/weights";

const W = 640;
const X0 = 250;
const X1 = W - 30;
const NMAX = 2;
const sx = (n: number) => X0 + ((n - 1) / (NMAX - 1)) * (X1 - X0);

export function ConcentrationView() {
  const { model } = useModel();
  const total = dataset.assumptions.totalRevenue;
  const notes = new Map(dataset.concentrationNotes.map((n) => [n.component, n]));
  const comps = model.components;
  const rowH = 46;
  const H = 40 + comps.length * rowH;

  return (
    <div className="space-y-10">
      <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h2 className="serif text-lg">Where &ldquo;dual sourcing&rdquo; is an illusion</h2>
          <p className="mb-3 text-[13px] text-muted">
            Effective number of independent sources, N<sub>eff</sub> = 1 / Σ share². Grey: what the Tier-1 allocation suggests. Teal: what is left after
            common ownership and shared sub-tier sources.
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Apparent versus real effective number of sources per component">
            {[1, 1.25, 1.5, 1.75, 2].map((v) => (
              <g key={v}>
                <line x1={sx(v)} x2={sx(v)} y1={24} y2={H - 6} stroke="var(--color-rule)" strokeWidth={0.5} />
                <text x={sx(v)} y={16} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
                  {v === 1 ? "1 (single)" : v}
                </text>
              </g>
            ))}
            {comps.map((c, i) => {
              const y = 40 + i * rowH;
              const apparent = c.nEffTier1;
              const real = c.binding;
              const lost = apparent - real > 1e-9;
              const comp = dataset.components.find((x) => x.id === c.component);
              return (
                <g key={c.component}>
                  <text x={0} y={y + 4} fontSize={12} fill="var(--color-ink)">
                    {c.component} {comp?.name}
                  </text>
                  <text x={0} y={y + 17} fontSize={10} fill="var(--color-muted)">
                    {notes.get(c.component)?.usedIn}
                  </text>
                  {lost && <line x1={sx(apparent) - 6} x2={sx(real) + 7} y1={y} y2={y} stroke="var(--color-accent)" strokeWidth={1.5} markerEnd="url(#arrow)" />}
                  <circle cx={sx(apparent)} cy={y} r={5} fill="var(--color-watch)" />
                  {lost && (
                    <text x={sx(apparent)} y={y - 9} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
                      {fmtNum(apparent, 2)}
                    </text>
                  )}
                  <circle cx={sx(real)} cy={y} r={5} fill="var(--color-accent)" />
                  <text x={sx(real) + (lost ? -10 : 10)} y={y + 4} textAnchor={lost ? "end" : "start"} fontSize={10} fill="var(--color-accent)">
                    {lost ? "" : fmtNum(real, 1)}
                  </text>
                </g>
              );
            })}
            <defs>
              <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" fill="var(--color-accent)" />
              </marker>
            </defs>
          </svg>
        </div>
        <div className="space-y-3 text-[12.5px]">
          {comps
            .filter((c) => c.nEffTier1 - c.binding > 1e-9)
            .map((c) => (
              <div key={c.component} className="border-l-2 border-accent pl-2">
                <p className="font-medium">
                  {c.component}: {fmtNum(c.nEffTier1, 2)} → {fmtNum(c.binding, 1)}
                </p>
                <p>{notes.get(c.component)?.readout}</p>
                <p className="text-muted">
                  Tier-1: {c.tier1Shares.map((s) => `${entityName(s.supplierId).split(" ")[0]} ${fmtPct(s.share, 0)}`).join(" / ")}
                  {c.ownerShares.length < c.tier1Shares.length && ` · one owner: ${entityName(c.ownerShares[0].ownerId).replace(/ Ltd\.$/, "")}`}
                  {c.subTier
                    .filter((s) => s.nEff <= 1 + 1e-9)
                    .map((s) => ` · ${s.category}: ${entityName(s.shares[0].supplierId).split(" ")[0]} only`)
                    .join("")}
                </p>
                <p className="text-muted">Binding constraint: {notes.get(c.component)?.binding}</p>
              </div>
            ))}
          <p className="text-muted">The other components already have a single Tier-1 source (N<sub>eff</sub> = 1).</p>
        </div>
      </section>

      <section>
        <h2 className="serif text-lg">What one regional event could stop</h2>
        <p className="mb-3 text-[13px] text-muted">
          Revenue at stake per zone = for each product, the largest exposure of any mapped node in the zone. Upper bound counts every mapped link;
          &ldquo;confirmed&rdquo; counts Tier-1 allocations and documented sole sources only. Click a zone to see it on the network.
        </p>
        <div className="grid grid-cols-2 gap-px bg-rule md:grid-cols-4">
          {model.zones.map((z) => {
            const note = dataset.zoneNotes.find((n) => n.zone === z.zone);
            const full = z.confirmedRevenue >= total - 1e-6;
            return (
              <Link key={z.zone} href={`/network?zone=${z.zone}`} className={`block bg-paper p-3 hover:bg-paper-2 ${full ? "outline-2 -outline-offset-2 outline-accent" : ""}`}>
                <div className="flex items-baseline justify-between">
                  <span className="serif text-lg">{z.zone}</span>
                  <span className="text-xs text-muted">{placeName(z.zone) ?? "no place name in case"}</span>
                </div>
                <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-2 text-[12.5px]">
                  <dt className="text-muted">Upper bound</dt>
                  <dd className="num text-right">
                    USD {fmtNum(z.revenueAtStake, 0)}m · {fmtPct(z.share, 0)}
                  </dd>
                  <dt className="text-muted">Confirmed only</dt>
                  <dd className={`num text-right ${full ? "font-medium text-accent" : ""}`}>
                    USD {fmtNum(z.confirmedRevenue, 0)}m · {fmtPct(z.confirmedRevenue / total, 0)}
                  </dd>
                  <dt className="text-muted">Hazard · logistics</dt>
                  <dd className="num text-right">
                    {z.hazard ?? "—"} · {z.logistics ?? "—"}
                  </dd>
                </dl>
                <p className="mt-1.5 text-xs">{z.nodeIds.length ? z.nodeIds.map((id) => model.byId.get(id)?.name.split(" ")[0]).join(", ") : note?.nodesLabel}</p>
                {note?.readout && <p className="mt-1 text-xs text-muted">{note.readout}</p>}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
