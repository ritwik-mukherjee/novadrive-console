"use client";

import { dataset } from "@/lib/data";
import { fmtNum } from "@/lib/format";
import { useWeights } from "@/lib/weights";
import type { Weights } from "@/lib/types";

interface Props {
  normalised: Weights;
  vulnRawSum: number;
  impactRawSum: number;
  activeScenario: string | null;
  isBase: boolean;
}

const VULN: [keyof Weights["vuln"], string][] = [
  ["financial", "Financial"],
  ["operational", "Operational"],
  ["assurance", "Assurance gap"],
  ["geographic", "Geographic"],
];
const IMPACT: [keyof Weights["impact"], string][] = [
  ["revenue", "Revenue exposure"],
  ["recovery", "Recovery difficulty"],
  ["centrality", "Network centrality"],
];

export function WeightsPanel({ normalised, vulnRawSum, impactRawSum, activeScenario, isBase }: Props) {
  const { raw, setVuln, setImpact, setOverlay, setPercentile, applyScenario, reset } = useWeights();

  return (
    <aside aria-label="Model weights" className="space-y-5 text-[13px]">
      <section>
        <h2 className="label mb-2">Scenario presets</h2>
        <div className="flex flex-col">
          {dataset.scenarios.map((s) => {
            const on = s.id === activeScenario;
            return (
              <button
                key={s.id}
                onClick={() => applyScenario(s.id)}
                aria-pressed={on}
                title={s.rationale}
                className={`border-l-2 py-1 pl-2 text-left ${on ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                <span className="num mr-1.5">{s.id}</span>
                {s.name}
              </button>
            );
          })}
        </div>
      </section>

      <Group
        title="Vulnerability pillars"
        rawSum={vulnRawSum}
        rows={VULN.map(([k, label]) => ({
          key: k,
          label,
          raw: raw.vuln[k],
          used: normalised.vuln[k],
          onChange: (v: number) => setVuln(k, v),
        }))}
      />
      <Group
        title="Impact weights"
        rawSum={impactRawSum}
        rows={IMPACT.map(([k, label]) => ({
          key: k,
          label,
          raw: raw.impact[k],
          used: normalised.impact[k],
          onChange: (v: number) => setImpact(k, v),
        }))}
      />

      <section className="space-y-3">
        <Slider
          label="Confirmed-event overlay"
          display={`+${fmtNum(raw.overlayPoints, 0)} pts`}
          min={0}
          max={30}
          step={1}
          value={raw.overlayPoints}
          onChange={setOverlay}
        />
        <Slider
          label="Missing-data imputation percentile"
          display={`P${fmtNum(raw.imputePercentile * 100, 0)}`}
          min={0.5}
          max={1}
          step={0.05}
          value={raw.imputePercentile}
          onChange={setPercentile}
        />
      </section>

      <button
        onClick={reset}
        disabled={isBase}
        className="border hairline px-3 py-1.5 text-[13px] disabled:text-muted enabled:hover:border-ink"
      >
        Reset to base
      </button>
    </aside>
  );
}

interface Row {
  key: string;
  label: string;
  raw: number;
  used: number;
  onChange: (v: number) => void;
}

function Group({ title, rows, rawSum }: { title: string; rows: Row[]; rawSum: number }) {
  const off = Math.abs(rawSum - 1) > 1e-9;
  return (
    <section className="space-y-3">
      <h2 className="label">{title}</h2>
      {rows.map((r) => (
        <Slider
          key={r.key}
          label={r.label}
          display={`${fmtNum(r.used * 100, 0)}%`}
          min={0}
          max={1}
          step={0.01}
          value={r.raw}
          onChange={r.onChange}
        />
      ))}
      {off && (
        <p className="text-xs text-muted" role="status">
          Sliders sum to {fmtNum(rawSum * 100, 0)}%; rescaled so the weights used sum to 100%.
        </p>
      )}
    </section>
  );
}

function Slider(props: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between">
        <span>{props.label}</span>
        <span className="num text-ink">{props.display}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}
