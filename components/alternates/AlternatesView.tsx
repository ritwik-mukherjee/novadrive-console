"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { BandChip, ConfidenceMarker } from "@/components/ui/marks";
import { ROUTE_LABELS, componentsForNode, toCsv, viewCandidate, type CandidateView, type Route } from "@/lib/alternates";
import { useAltState, type LiveCandidate } from "@/lib/altStore";
import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import { fitment } from "@/lib/engine";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { useModel } from "@/lib/weights";
import { FitBar, RiskChip, ScoreSteppers, domainOf } from "./parts";

export function AlternatesView() {
  const { model } = useModel();
  const params = useSearchParams();
  const router = useRouter();
  const { edits, dependent, live, search, setScore, resetScores, toggleDependent, setSearch, addLive, setAccepted } = useAltState();
  const [route, setRoute] = useState<Route | "all">("all");
  const [open, setOpen] = useState<string | null>(null);

  const all = useMemo(() => dataset.alternates.map((a) => viewCandidate(a, dataset, model, edits, dependent)), [model, edits, dependent]);
  const flagged = useMemo(() => {
    const ids = new Set(all.flatMap((c) => c.nodes));
    return model.scored.filter((n) => ids.has(n.id)).sort((a, b) => a.rank - b.rank);
  }, [all, model]);
  const others = model.scored.filter((n) => !flagged.includes(n)).sort((a, b) => a.rank - b.rank);

  const nodeId = params.get("node") ?? flagged[0]?.id ?? "ORG-439";
  const node = model.byId.get(nodeId);
  const comps = componentsForNode(nodeId, dataset);
  const forNode = all.filter((c) => c.nodes.includes(nodeId));
  const shown = forNode.filter((c) => route === "all" || c.route === route).sort((a, b) => rankRec(a) - rankRec(b) || b.fit - a.fit);
  const liveForNode = live.filter((c) => c.nodeId === nodeId);
  const st = search[nodeId] ?? { status: "idle" as const };
  const fw = dataset.assumptions.fitment.weights;

  const runSearch = async () => {
    setSearch(nodeId, { status: "loading" });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch("/api/alternates/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodeId }),
        signal: ctrl.signal,
      });
      const body = await res.json();
      if (res.status === 503 && body.configured === false) {
        setSearch(nodeId, { status: "unconfigured", message: body.message });
      } else if (!res.ok) {
        setSearch(nodeId, { status: "error", message: `${body.error ?? "Search failed"} Showing the curated shortlist.` });
      } else {
        addLive(nodeId, (body.candidates as Omit<LiveCandidate, "accepted" | "component">[]).map((c) => ({ ...c, component: comps.map((x) => x.id).join("/"), accepted: false })));
        setSearch(nodeId, { status: "done", searchedAt: body.searchedAt, cached: body.cached });
      }
    } catch {
      setSearch(nodeId, { status: "error", message: "Search timed out or the network failed. Showing the curated shortlist." });
    } finally {
      clearTimeout(timer);
    }
  };

  const download = () => {
    const accepted = liveForNode.filter((c) => c.accepted);
    let csv = toCsv(forNode, `NovaDrive alternates for ${node?.name ?? nodeId} · market research as of ${dataset.assumptions.dates.researchAsOf} · exported ${new Date().toISOString().slice(0, 10)}`);
    if (accepted.length) {
      csv += "\r\n\r\n# Live-search candidates accepted by the user (unverified sources; risk not yet screened)\r\nCandidate,HQ,Product line,Footprint,Evidence,Source,Source date,Fitment\r\n";
      csv += accepted
        .map((c) => [c.legalEntity, c.hq, c.productLine, c.footprint, c.evidence, c.url, c.pageDate, fitment(edits[c.id] ?? c.scores, dataset.assumptions).toFixed(1)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\r\n");
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `novadrive-alternates-${nodeId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const callouts = all.filter((c) => c.alt.risk !== "Green");

  return (
    <div className="space-y-6">
      {/* Node and component context */}
      <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-2">
          <label className="flex flex-col gap-0.5">
            <span className="label">Flagged node</span>
            <select value={nodeId} onChange={(e) => router.replace(`/alternates?node=${e.target.value}`)} className="border-b hairline bg-transparent py-1 text-[15px]">
              <optgroup label="Nodes with a researched shortlist">
                {flagged.map((n) => (
                  <option key={n.id} value={n.id}>
                    #{n.rank} {n.name} ({n.band})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Other nodes (live search only)">
                {others.map((n) => (
                  <option key={n.id} value={n.id}>
                    #{n.rank} {n.name} ({n.band})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {node && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <BandChip band={node.band} />
              <ConfidenceMarker label={node.confidence.label} showText />
              <span className="num">{fmtPct(node.share, 0)} of revenue · RaR USD {fmtNum(node.rar, 0)}m</span>
              <span className="text-muted">{node.actionLabel}</span>
            </div>
          )}
        </div>
        <div className="space-y-2 text-[12.5px]">
          <p className="label">What we need to replace (case Components sheet)</p>
          {comps.map((c) => (
            <div key={c.id} className="border-l-2 border-accent pl-2">
              <p>
                <span className="font-medium">
                  {c.id} {c.name}
                </span>{" "}
                · used in {c.products.join(", ")} · qualification ~{c.leadTimeWeeks} wks
              </p>
              <p className="text-muted">
                {c.useCase}. {c.screeningCriteria}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Route selector + export */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-y hairline py-2 text-[13px]">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sourcing route">
          {(["all", "same-tier", "sub-tier", "platform"] as const).map((r) => {
            const n = r === "all" ? forNode.length : forNode.filter((c) => c.route === r).length;
            return (
              <button
                key={r}
                role="tab"
                aria-selected={route === r}
                onClick={() => setRoute(r)}
                className={`border px-2 py-1 ${route === r ? "border-accent text-accent" : "hairline text-muted hover:text-ink"}`}
              >
                {r === "all" ? "All routes" : ROUTE_LABELS[r]} <span className="num">({n})</span>
              </button>
            );
          })}
        </div>
        <button onClick={download} disabled={forNode.length === 0} className="border border-ink px-3 py-1 hover:bg-ink hover:text-paper disabled:border-rule disabled:text-muted">
          Download shortlist (CSV)
        </button>
      </div>

      {/* Curated shortlist */}
      <section aria-label="Curated shortlist">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="serif text-base">Researched shortlist</h2>
          <p className="text-xs text-muted">Current public sources as at {fmtDate(dataset.assumptions.dates.researchAsOf)}. Fitment is scored separately from supplier risk.</p>
        </div>
        {shown.length === 0 ? (
          <p className="py-3 text-muted">No researched candidates for this node{route !== "all" ? " on this route" : ""}. Run a live search below.</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b hairline">
                {["Candidate", "Route", "Fitment", "Risk screen", "Recommendation", "Source"].map((h) => (
                  <th key={h} className="label py-2 pr-3 text-left font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <CandidateRows
                  key={c.alt.n}
                  c={c}
                  open={open === String(c.alt.n)}
                  onToggle={() => setOpen((o) => (o === String(c.alt.n) ? null : String(c.alt.n)))}
                  onScore={(k, v) => setScore(String(c.alt.n), c.alt.scores, k, v)}
                  onReset={() => resetScores(String(c.alt.n))}
                  onDependent={() => toggleDependent(String(c.alt.n))}
                  weights={fw}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Live search */}
      <section className="border hairline p-4" aria-label="Live public-source search">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="serif text-base">Search current public sources</h2>
          <button
            onClick={runSearch}
            disabled={st.status === "loading"}
            className="border border-accent px-3 py-1 text-[13px] text-accent hover:bg-accent hover:text-paper disabled:opacity-50"
          >
            {st.status === "loading" ? "Searching…" : liveForNode.length ? "Search again" : "Run live search"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          The query is built from the component, application and screening criteria above, and excludes the incumbent and anything that depends on it.
          Results stay &ldquo;Unverified&rdquo; until you accept them.
        </p>
        {st.status === "loading" && <p className="mt-3 text-[13px]" role="status">Searching manufacturer pages and dated releases (up to ~45 s)…</p>}
        {(st.status === "unconfigured" || st.status === "error") && (
          <p className="mt-3 border-l-2 border-high pl-2 text-[13px]" role="status">
            {st.message}
          </p>
        )}
        {st.status === "done" && (
          <p className="mt-2 text-xs text-muted">
            {liveForNode.length} candidates · searched {st.searchedAt?.slice(0, 16).replace("T", " ")} UTC{st.cached ? " (cached)" : ""}
          </p>
        )}
        {liveForNode.length > 0 && (
          <ul className="mt-3 space-y-3">
            {liveForNode.map((c) => {
              const scores = edits[c.id] ?? c.scores;
              const fit = fitment(scores, dataset.assumptions);
              const dep = Boolean(dependent[c.id]);
              return (
                <li key={c.id} className="border-t hairline pt-2 text-[13px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="font-medium">{c.legalEntity}</span> <span className="text-muted">· {c.hq}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <FitBar fit={fit} excluded={dep} />
                      <span className={`border px-1.5 text-[11px] ${c.accepted ? "border-accent text-accent" : "border-high text-high"}`}>
                        {c.accepted ? "Accepted for review" : "Unverified — review before shortlisting"}
                      </span>
                    </span>
                  </div>
                  <p className="mt-0.5">{c.productLine}</p>
                  <p className="text-muted">&ldquo;{c.evidence}&rdquo; · footprint: {c.footprint}</p>
                  <p className="text-xs">
                    <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                      {domainOf(c.url) ?? c.url}
                    </a>{" "}
                    · {c.pageDate}
                  </p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted">Suggested scores and reasons</summary>
                    <div className="mt-1 max-w-xl">
                      <ScoreSteppers scores={scores} weights={fw} reasons={c.reasons} onChange={(k, v) => setScore(c.id, c.scores, k, v)} />
                    </div>
                  </details>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    <button onClick={() => setAccepted(c.id, !c.accepted)} className="underline">
                      {c.accepted ? "Mark unverified" : "Accept for review"}
                    </button>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={dep} onChange={() => toggleDependent(c.id)} className="accent-[var(--color-critical)]" />
                      Uses the failed node?
                    </label>
                    {dep && <span className="font-medium text-critical">NOT INDEPENDENT – excluded</span>}
                    <span className="text-muted">Risk screen: not yet done for live results</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Callouts */}
      <section aria-label="Risk-screen callouts">
        <h2 className="label mb-2">Risk-screen and recency callouts (all nodes)</h2>
        <ul className="grid gap-x-6 gap-y-2 text-[12.5px] md:grid-cols-2">
          {callouts.map((c) => (
            <li key={c.alt.n} className="border-l-2 pl-2" style={{ borderColor: c.alt.risk === "Red" ? "var(--color-critical)" : "var(--color-high)" }}>
              <span className="font-medium">{c.alt.candidate.split(" – ")[0]}</span> · {c.alt.component} · fitment <span className="num">{fmtNum(c.fit, 0)}</span> ·{" "}
              <span className="font-medium">{c.recommendation}</span>
              <span className="block text-muted">{c.alt.riskNote}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const rankRec = (c: CandidateView) =>
  c.recommendation.startsWith("SHORTLIST") ? 0 : c.recommendation === "RESERVE" ? 1 : c.recommendation === "Not shortlisted" ? 2 : 3;

function CandidateRows({
  c,
  open,
  onToggle,
  onScore,
  onReset,
  onDependent,
  weights,
}: {
  c: CandidateView;
  open: boolean;
  onToggle: () => void;
  onScore: (k: keyof CandidateView["scores"], v: number) => void;
  onReset: () => void;
  onDependent: () => void;
  weights: CandidateView["scores"];
}) {
  const openDrawer = useDrawer((s) => s.open);
  const excluded = c.recommendation.startsWith("EXCLUDE");
  const [name, hq] = c.alt.candidate.split(" – ");
  const domain = domainOf(c.alt.source);
  return (
    <>
      <tr className={`border-b hairline align-top ${open ? "bg-paper-2" : ""}`}>
        <td className="py-2 pr-3">
          <button onClick={onToggle} aria-expanded={open} className="text-left">
            <span className="font-medium">{name}</span>
            <span className="ml-1 text-muted">{open ? "−" : "+"}</span>
            <span className="block text-xs text-muted">{hq}</span>
          </button>
          {c.notIndependent && <span className="mt-0.5 inline-block border border-critical px-1 text-[11px] font-medium text-critical">NOT INDEPENDENT</span>}
        </td>
        <td className="py-2 pr-3 text-xs">
          {ROUTE_LABELS[c.route]}
          <span className="block text-muted">{c.alt.route}</span>
        </td>
        <td className="py-2 pr-3">
          <FitBar fit={c.fit} excluded={excluded} />
          {c.edited && <span className="block text-[11px] text-accent">edited</span>}
        </td>
        <td className="py-2 pr-3">
          <RiskChip risk={c.alt.risk} note={c.alt.riskNote} />
        </td>
        <td className={`py-2 pr-3 ${excluded ? "text-critical" : c.recommendation.startsWith("SHORTLIST") ? "font-medium" : ""}`}>{c.recommendation}</td>
        <td className="py-2 text-xs">
          {domain ? (
            <a href={c.alt.source} target="_blank" rel="noreferrer" className="underline">
              {domain}
            </a>
          ) : (
            <span>{c.alt.source}</span>
          )}
          <span className="block text-muted">{c.alt.sourceDate}</span>
        </td>
      </tr>
      {open && (
        <tr className="border-b hairline bg-paper-2">
          <td colSpan={6} className="px-2 pb-3 pt-1">
            <div className="grid gap-6 text-[12.5px] lg:grid-cols-[1fr_380px]">
              <div className="space-y-2">
                <p>
                  <span className="label">Product line & evidence </span>
                  {c.alt.evidence}
                </p>
                <p>
                  <span className="label">Footprint </span>
                  {c.alt.footprint}
                </p>
                <p>
                  <span className="label">Risk note (separate from fitment) </span>
                  {c.alt.riskNote}
                </p>
                <p className="border-l-2 border-accent pl-2">
                  <span className="label">What engineering must still validate </span>
                  {c.alt.validate}
                </p>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={c.notIndependent} onChange={onDependent} className="accent-[var(--color-critical)]" />
                  Uses the failed node? (e.g. buys the same dies or substrates) — if yes, it is not an alternate.
                </label>
                <button className="text-xs underline" onClick={() => openDrawer({ kind: "candidate", id: String(c.alt.n) })}>
                  Open in drawer
                </button>
              </div>
              <div>
                <ScoreSteppers scores={c.scores} weights={weights} onChange={onScore} />
                <div className="mt-1 flex justify-between text-xs">
                  <span>
                    Fitment = Σ points = <span className="num font-medium">{fmtNum(c.fit, 1)}</span>; risk screen unchanged.
                  </span>
                  {c.edited && (
                    <button onClick={onReset} className="underline">
                      Reset to workbook
                    </button>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
