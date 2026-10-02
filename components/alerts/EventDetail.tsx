"use client";

import Link from "next/link";
import { EvidenceRecordView } from "@/components/drawer/parts";
import { BandChip } from "@/components/ui/marks";
import type { FeedItem, StepStatus } from "@/lib/alertFeed";
import { CARD_STATUSES, useAlertState } from "@/lib/alertStore";
import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import { fmtDate, fmtNum } from "@/lib/format";
import { useModel } from "@/lib/weights";
import { LevelChip } from "./LevelChip";

const MARK: Record<StepStatus, { glyph: string; color: string; label: string }> = {
  pass: { glyph: "✓", color: "var(--color-accent)", label: "pass" },
  stop: { glyph: "×", color: "var(--color-critical)", label: "stop" },
  warn: { glyph: "!", color: "var(--color-high)", label: "caution" },
  ask: { glyph: "?", color: "var(--color-accent)", label: "needs your choice" },
  skip: { glyph: "–", color: "var(--color-rule)", label: "not reached" },
};

export function PipelineStepper({ item, compact = false }: { item: FeedItem; compact?: boolean }) {
  return (
    <ol className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-5"}`} aria-label="Processing pipeline">
      {item.steps.map((s) => {
        const m = MARK[s.status];
        return (
          <li key={s.n} className="border-t-2 pt-1.5 text-[12px]" style={{ borderColor: m.color }}>
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-flex h-4 w-4 items-center justify-center text-[11px] font-semibold"
                style={{ color: s.status === "skip" ? "var(--color-muted)" : "var(--color-paper)", background: s.status === "skip" ? "transparent" : m.color, border: `1px solid ${m.color}` }}
              >
                {m.glyph}
              </span>
              <span className="font-medium">
                {s.n}. {s.name}
              </span>
              <span className="sr-only">({m.label})</span>
            </div>
            <p className={`mt-1 leading-snug ${s.status === "skip" ? "text-muted" : ""}`}>{s.text}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function EventDetail({ item, inDrawer = false }: { item: FeedItem; inDrawer?: boolean }) {
  const { model } = useModel();
  const open = useDrawer((s) => s.open);
  const { statuses, setStatus, choose } = useAlertState();
  const { event: ev, match: m, alert: a, card } = item;
  const status = statuses[ev.id] ?? "New";
  const actionable = !["MERGED", "SUPPRESS – stale", "SUPPRESS – wrong entity"].includes(a.level);
  const total = dataset.assumptions.totalRevenue;

  return (
    <article className="space-y-4 text-[13px]">
      <header className="space-y-1.5">
        <p className="label">
          {ev.id} · {ev.simulated ? "typed-in event" : "case event feed"} · {ev.sourceFamily || "no source family"} · {ev.sourceType ?? "—"}
        </p>
        <h2 className="text-xl leading-tight">{ev.title}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <LevelChip level={a.level} label={a.levelLabel} provisional={item.provisional} />
          <span className="num">score {fmtNum(a.score, 1)}</span>
          <span className="text-muted">
            published {fmtDate(ev.published)} · effective {fmtDate(ev.effective)}
          </span>
        </div>
        {ev.text && <p className="text-muted">{ev.text}</p>}
      </header>

      <PipelineStepper item={item} compact={inDrawer} />

      {m.ambiguous && (
        <section className="border border-accent p-3">
          <p className="font-medium">
            &ldquo;{m.ambiguous.mention}&rdquo; could mean {m.ambiguous.options.length} different things. Which one is it?
          </p>
          <p className="mb-2 text-xs text-muted">
            The matcher does not guess. Until you choose, every reading is flagged and the alert is scored on the most exposed one.
          </p>
          <ul className="space-y-1.5">
            {m.ambiguous.options.map((o) => {
              const on = m.chosen === o.key;
              const node = model.byId.get(o.match.primaryNode ?? "");
              return (
                <li key={o.key} className="flex flex-wrap items-baseline justify-between gap-2 border-t hairline pt-1.5">
                  <span>
                    <span className="font-medium">{o.label}</span>
                    <span className="block text-xs text-muted">
                      {o.match.kind === "wrong-entity"
                        ? "Not a NovaDrive supplier → would be suppressed"
                        : o.match.kind === "own-plant"
                          ? `NovaDrive's own plant, ${Math.round((o.match.exposureOverride ?? 0) * 100)}% of revenue built there`
                          : node
                            ? `${node.name.replace(/ Ltd\.$/, "")}, M ${o.match.M}, ${Math.round(node.share * 100)}% of revenue`
                            : o.match.networkMatch}
                    </span>
                  </span>
                  <button
                    onClick={() => choose(ev.id, on ? null : o.key)}
                    aria-pressed={on}
                    className={`border px-2 py-0.5 text-xs ${on ? "border-accent bg-accent text-paper" : "border-accent text-accent"}`}
                  >
                    {on ? "Chosen (undo)" : "This one"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
        <p>
          <span className="text-muted">Severity S {fmtNum(m.S, 1)}:</span> {m.severityLabel}
          {m.severityWords.length > 0 && <span className="text-muted"> (&ldquo;{m.severityWords.join("”, “")}&rdquo;)</span>}
        </p>
        <p>
          <span className="text-muted">Credibility C {fmtNum(a.C, 1)}:</span> {a.C === 0 ? "duplicate or stale" : m.credibilityLabel}
        </p>
        <p className="sm:col-span-2">
          <span className="text-muted">Recognised in the text: </span>
          {m.mentions.length === 0
            ? "nothing from the entity, site or place dictionary"
            : m.mentions.map((x, i) => (
                <span key={i} className={x.negated ? "text-muted line-through" : ""} title={x.negated ? "negated in the text (\"not …\")" : x.kind}>
                  {i > 0 ? ", " : ""}
                  {x.text} <span className="text-[10px] text-muted">{x.kind}</span>
                </span>
              ))}
        </p>
      </section>

      {actionable ? (
        <section className="space-y-3 border-t-2 border-ink pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="serif text-base">Alert card</h3>
            <label className="flex items-center gap-2 text-xs">
              <span className="label">Status</span>
              <select value={status} onChange={(e) => setStatus(ev.id, e.target.value as typeof status)} className="border-b hairline bg-transparent py-0.5">
                {CARD_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <Row label="Matched nodes">
            {m.matchedNodes.length === 0 ? (
              <span className="text-muted">{m.kind === "own-plant" ? "NovaDrive's own plant (not a supplier node)" : "None mapped"}</span>
            ) : (
              <ul className="space-y-0.5">
                {m.matchedNodes.map((id) => {
                  const n = model.byId.get(id)!;
                  return (
                    <li key={id} className="flex flex-wrap items-center gap-2">
                      <button className="underline decoration-rule underline-offset-2 hover:decoration-ink" onClick={() => open({ kind: "node", id })}>
                        {n.name.replace(/ Ltd\.$/, "")}
                      </button>
                      <span className="text-xs text-muted">
                        T{n.input.tier} · {n.input.facility} · {Math.round(n.share * 100)}% of revenue
                      </span>
                      <BandChip band={n.band} className="text-xs" />
                      {id === m.primaryNode && <span className="text-xs text-accent">primary</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Row>
          <Row label="Revenue at stake">
            <span className="num">
              USD {fmtNum(item.revenueAtStake, 0)}m / yr ({Math.round((item.revenueAtStake / total) * 100)}%) · USD {fmtNum(item.revenueAtStake / 52, 1)}m / week
            </span>
            {m.kind === "unresolved" && <span className="block text-xs text-muted">Upper bound: location unresolved.</span>}
          </Row>
          <Row label="Why it matters">{card.why}</Row>
          <Row label="Next action (24-72h)">{card.nextAction}</Row>
          <Row label="Verification still required">{card.verification}</Row>
          <Row label="Owner">{card.owner}</Row>
          <Row label="Escalation trigger">{card.escalation}</Row>
          {m.primaryNode && (
            <Link href={`/alternates?node=${m.primaryNode}`} className="inline-block border border-accent px-3 py-1.5 text-accent hover:bg-accent hover:text-paper">
              Find alternates for {model.byId.get(m.primaryNode)?.name.replace(/ Ltd\.$/, "")} →
            </Link>
          )}
        </section>
      ) : (
        <section className="border-t-2 border-ink pt-3">
          <h3 className="serif mb-1 text-base">Why no alert</h3>
          <p>{card.why}</p>
          <p className="mt-1 text-muted">{card.nextAction}</p>
        </section>
      )}

      {m.evidence.length > 0 && (
        <section>
          <h3 className="label mb-1">Evidence behind this decision</h3>
          <ul className="space-y-2">
            {[...new Set(m.evidence)].map((id) => (
              <EvidenceRecordView key={id} id={id} />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[170px_1fr]">
      <span className="text-muted">{label}</span>
      <div>{children}</div>
    </div>
  );
}
