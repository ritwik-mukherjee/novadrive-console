"use client";

import { FitBar, RiskChip, ScoreSteppers, domainOf } from "@/components/alternates/parts";
import { BandChip } from "@/components/ui/marks";
import { ROUTE_LABELS, viewCandidate } from "@/lib/alternates";
import { useAltState } from "@/lib/altStore";
import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import { useModel } from "@/lib/weights";
import { Section } from "./parts";

export function CandidateDrawer({ id }: { id: string }) {
  const { model } = useModel();
  const open = useDrawer((s) => s.open);
  const { edits, dependent, setScore, toggleDependent } = useAltState();
  const alt = dataset.alternates.find((a) => String(a.n) === id);
  if (!alt) return <p className="text-muted">Unknown candidate {id}.</p>;
  const c = viewCandidate(alt, dataset, model, edits, dependent);
  const [name, hq] = alt.candidate.split(" – ");
  return (
    <div className="space-y-4 text-[13px]">
      <header className="space-y-1.5">
        <p className="label">
          Alternate #{alt.n} · {alt.component}
        </p>
        <h2 className="text-xl leading-tight">{name}</h2>
        <p className="text-muted">{hq}</p>
        <div className="flex flex-wrap items-center gap-4">
          <FitBar fit={c.fit} excluded={c.recommendation.startsWith("EXCLUDE")} />
          <RiskChip risk={alt.risk} note={alt.riskNote} />
        </div>
        <p className="border-l-2 border-accent pl-2 font-medium">{c.recommendation}</p>
      </header>
      <Section title="For which flagged node">
        <ul className="space-y-1">
          {c.nodes.map((nid) => {
            const n = model.byId.get(nid)!;
            return (
              <li key={nid} className="flex items-center gap-2">
                <button className="underline decoration-rule underline-offset-2" onClick={() => open({ kind: "node", id: nid })}>
                  {n.name}
                </button>
                <BandChip band={n.band} className="text-xs" />
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-muted">
          {ROUTE_LABELS[c.route]}: {alt.route}
        </p>
      </Section>
      <Section title="Evidence and source">
        <p>{alt.evidence}</p>
        <p className="mt-1 text-muted">Footprint: {alt.footprint}</p>
        <p className="mt-1">
          {domainOf(alt.source) ? (
            <a href={alt.source} target="_blank" rel="noreferrer" className="underline">
              {domainOf(alt.source)}
            </a>
          ) : (
            alt.source
          )}{" "}
          · {alt.sourceDate}
        </p>
      </Section>
      <Section title="Fitment (editable) – risk is screened separately">
        <ScoreSteppers scores={c.scores} weights={dataset.assumptions.fitment.weights} onChange={(k, v) => setScore(id, alt.scores, k, v)} />
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" checked={c.notIndependent} onChange={() => toggleDependent(id)} className="accent-[var(--color-critical)]" />
          Uses the failed node? {c.notIndependent && <span className="font-medium text-critical">NOT INDEPENDENT</span>}
        </label>
      </Section>
      <Section title="Risk note">
        <p>{alt.riskNote}</p>
      </Section>
      <Section title="What sourcing / engineering must still validate">
        <p>{alt.validate}</p>
      </Section>
    </div>
  );
}
