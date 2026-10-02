"use client";

import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import { runChecks } from "@/lib/engine";
import { fmtDate, fmtNum } from "@/lib/format";
import type { Action } from "@/lib/types";
import { useModel } from "@/lib/weights";

const pct = (x: number) => `${fmtNum(x * 100, 0)}%`;

export function MethodologyView() {
  const { model, weights: w } = useModel();
  const open = useDrawer((s) => s.open);
  const a = dataset.assumptions;
  const checks = runChecks(dataset, model.scored, w);
  const fw = a.fitment.weights;
  const phases: Action["phase"][] = ["Respond", "Hedge", "Restructure", "Govern"];

  return (
    <div className="space-y-10 text-[13px]">
      <section className="grid gap-4 md:grid-cols-2">
        <DateCard label="Case cut-off" date={a.dates.caseCutoff} text="Network, scores and alerts are assessed as at this date (latest event in the case feed)." />
        <DateCard label="Market research as-of" date={a.dates.researchAsOf} text="Alternate suppliers use current public sources up to this date (launches, closures, acquisitions). The two dates are deliberately different." />
      </section>

      <section>
        <h2 className="serif mb-3 text-lg">Formulas (at the weights currently in use)</h2>
        <div className="grid gap-px bg-rule md:grid-cols-2 xl:grid-cols-3">
          <Formula title="Vulnerability V (0-100)">
            V = min(100, {pct(w.vuln.financial)}·Financial + {pct(w.vuln.operational)}·Operational + {pct(w.vuln.assurance)}·Assurance gap + {pct(w.vuln.geographic)}·Geographic + {w.overlayPoints}·EventOverlay)
            <Note>
              Financial = {pct(w.finSplit.leverage)} leverage + {pct(w.finSplit.liquidity)} liquidity; Operational = {pct(w.opSplit.level)} OTD level + {pct(w.opSplit.trend)} OTD trend;
              Geographic = mean(hazard, logistics, infrastructure). Missing financials and assurance are imputed at the peer P{fmtNum(w.imputePercentile * 100, 0)}: missing is not low risk.
            </Note>
          </Formula>
          <Formula title="Impact I (0-100)">
            I = {pct(w.impact.revenue)}·(revenue share × 100) + {pct(w.impact.recovery)}·min(100, TTR / {a.ttrCap} × 100) + {pct(w.impact.centrality)}·min(100, downstream Tier-1s / {a.centralityMax} × 100)
            <Note>Exposure propagates Tier-1 → Tier-2 → Tier-3 over included links, capped at 100% per product. Revenue-at-risk = weekly revenue exposed × TTR weeks.</Note>
          </Formula>
          <Formula title="Priority and band">
            Priority = I × V / 100 → Critical ≥ {a.bands.critical} · High ≥ {a.bands.high} · Elevated ≥ {a.bands.elevated} · else Watch
            <Note>
              Quadrant: I ≥ {a.quadrant.impactHigh} and V ≥ {a.quadrant.vulnHigh} Act now · I ≥ {a.quadrant.impactHigh} Protect · V ≥ {a.quadrant.vulnHigh} Remediate · else Routine. Ties
              broken by order of appearance.
            </Note>
          </Formula>
          <Formula title="Confidence (separate axis)">
            Points = link grade (A 3 · B 2 · C 1 · D 0) + data (8 indicators 2 · 6-7 1 · ≤5 0) + dependency (Tier-1 or confirmed sole 1) → High ≥ {a.confidence.high} · Medium ≥ {a.confidence.medium} · else Low
            <Note>Confidence decides act vs verify. It never changes the priority score.</Note>
          </Formula>
          <Formula title="Alert score">
            Score = 100 × S × C × M × E × (0.5 + V/200) [0.75 if no node matched] → HIGH ≥ {a.alert.high} · MEDIUM ≥ {a.alert.medium} · LOW ≥ {a.alert.low} · else LOG
            <Note>
              Duplicates (same source family) merge; published &gt; {a.alert.staleDays} days after effective is stale; M = 0 (wrong entity) suppresses. S: 1.0 disruption · 0.7 precursor · 0.4 logistics · 0.1
              admin. M: 1.0 exact site · 0.8 zone · 0.3 unresolved place · 0.2 non-production site · 0 wrong entity.
            </Note>
          </Formula>
          <Formula title="Alternate fitment (risk screened separately)">
            Fitment = ({pct(fw.technical)}·Tech + {pct(fw.application)}·Application + {pct(fw.footprint)}·Footprint & independence + {pct(fw.scale)}·Scale + {pct(fw.presence)}·Presence + {pct(fw.qualEase)}·Qual. ease) / 5 × 100
            <Note>
              Red risk → EXCLUDE · ≥ {a.fitment.shortlist} SHORTLIST (Amber: with risk conditions) · ≥ {a.fitment.reserve} RESERVE. Uses the failed node → not an alternate.
            </Note>
          </Formula>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-2">
        <div>
          <h2 className="serif mb-2 text-lg">Time-to-recover per node</h2>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b hairline">
                <th className="label py-1 text-left font-normal">Node</th>
                <th className="label py-1 text-right font-normal">TTR (wks)</th>
                <th className="label py-1 pl-3 text-left font-normal">Basis</th>
              </tr>
            </thead>
            <tbody>
              {dataset.nodes.map((n) => (
                <tr key={n.id} className="cursor-pointer border-b hairline align-top hover:bg-paper-2" onClick={() => open({ kind: "node", id: n.id })}>
                  <td className="py-1">{n.name.replace(/ Ltd\.$/, "")}</td>
                  <td className="num py-1 text-right">{n.ttrWeeks}</td>
                  <td className="py-1 pl-3 text-muted">{n.ttrBasis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-6">
          <div>
            <h2 className="serif mb-2 text-lg">Normalisation curves (raw → risk 0-100)</h2>
            <table className="w-full border-collapse text-[12.5px]">
              <tbody>
                {(
                  [
                    ["Net debt / EBITDA", a.curves.leverage],
                    ["Current ratio", a.curves.liquidity],
                    ["OTD 3-month %", a.curves.otdLevel],
                    ["OTD change pp", a.curves.otdTrend],
                  ] as const
                ).map(([label, c]) => (
                  <tr key={label} className="border-b hairline align-top">
                    <td className="py-1 pr-2">{label}</td>
                    <td className="num py-1">
                      {c.x.map((x, i) => `${x}→${c.y[i]}`).join("  ")}
                      <span className="block text-xs text-muted">{c.basis}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="serif mb-2 text-lg">Model integrity: {checks.filter((c) => c.pass).length} of {checks.length} checks pass</h2>
            <ul className="text-[12.5px]">
              {checks.map((c) => (
                <li key={c.n} className="flex justify-between gap-3 border-b hairline py-1">
                  <span>
                    <span className="num text-muted">{c.n}.</span> {c.check} <span className="num text-muted">({c.value})</span>
                  </span>
                  <span className={`font-medium ${c.pass ? "text-accent" : "text-critical"}`}>{c.pass ? "PASS" : "FAIL"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="serif mb-2 text-lg">Material unknowns</h2>
        <p className="mb-2 text-muted">Missing information is treated as uncertainty, never as low risk. Each line is a verification task.</p>
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b hairline">
              {["#", "Unknown", "Decision it affects", "How to resolve", "Owner", "Priority"].map((h) => (
                <th key={h} className="label py-1 pr-3 text-left font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...dataset.unknowns].sort((x, y) => x.priority.localeCompare(y.priority) || x.n - y.n).map((u) => (
              <tr key={u.n} className="border-b hairline align-top">
                <td className="num py-1 pr-3 text-muted">{u.n}</td>
                <td className="py-1 pr-3">
                  {u.unknown}
                  <span className="block text-xs text-muted">{u.nodes}</span>
                </td>
                <td className="py-1 pr-3">{u.decision}</td>
                <td className="py-1 pr-3">{u.resolve}</td>
                <td className="py-1 pr-3">{u.owner}</td>
                <td className={`py-1 font-medium ${u.priority === "P1" ? "text-critical" : ""}`}>{u.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="serif mb-3 text-lg">Action roadmap</h2>
        <div className="grid gap-px bg-rule md:grid-cols-4">
          {phases.map((ph) => {
            const items = dataset.actions.filter((x) => x.phase === ph);
            return (
              <div key={ph} className="bg-paper p-3">
                <p className="label">{items[0]?.horizon ?? ph}</p>
                <ol className="mt-2 space-y-3">
                  {items.map((x) => {
                    const v = x.valueNodeId ? model.byId.get(x.valueNodeId) : null;
                    return (
                      <li key={x.n} className="text-[12.5px]">
                        <p>
                          <span className="num text-muted">{x.n}.</span> {x.action}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {x.addresses} · {x.owner} · effort {x.effort}
                        </p>
                        <p className="text-xs">
                          KPI: {x.kpi}
                          {v && (
                            <>
                              {" "}
                              ·{" "}
                              <button className="underline" onClick={() => open({ kind: "node", id: v.id })}>
                                protects USD {fmtNum(v.rar, 0)}m RaR
                              </button>
                            </>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function DateCard({ label, date, text }: { label: string; date: string; text: string }) {
  return (
    <div className="border-l-4 border-accent pl-3">
      <p className="label">{label}</p>
      <p className="serif num text-2xl">{fmtDate(date)}</p>
      <p className="text-muted">{text}</p>
    </div>
  );
}

function Formula({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-paper p-4">
      <h3 className="label mb-1.5">{title}</h3>
      <div className="num leading-relaxed">{children}</div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-xs text-muted">{children}</p>;
}
