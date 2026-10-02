"use client";

import { fmtNum } from "@/lib/format";
import type { CriterionScores, RiskScreen } from "@/lib/types";

const RISK_COLOR: Record<RiskScreen, string> = {
  Green: "var(--color-accent)",
  Amber: "var(--color-high)",
  Red: "var(--color-critical)",
};

/** Risk screen is shown separately from fitment and never moves with it. */
export function RiskChip({ risk, note }: { risk: RiskScreen | "Unscreened"; note?: string }) {
  const color = risk === "Unscreened" ? "var(--color-muted)" : RISK_COLOR[risk];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={note}>
      <span aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: risk === "Unscreened" ? "transparent" : color, border: `1px solid ${color}` }} />
      <span>{risk === "Unscreened" ? "Not yet screened" : `${risk} risk`}</span>
    </span>
  );
}

export const CRITERIA: { key: keyof CriterionScores; label: string }[] = [
  { key: "technical", label: "Technical match" },
  { key: "application", label: "Application" },
  { key: "footprint", label: "Footprint & independence" },
  { key: "scale", label: "Scale / capacity" },
  { key: "presence", label: "Presence & quality" },
  { key: "qualEase", label: "Qualification ease" },
];

export function ScoreSteppers({
  scores,
  weights,
  onChange,
  reasons,
}: {
  scores: CriterionScores;
  weights: CriterionScores;
  onChange: (k: keyof CriterionScores, v: number) => void;
  reasons?: Partial<Record<keyof CriterionScores, string>>;
}) {
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr>
          <th className="label text-left font-normal">Criterion (weight)</th>
          <th className="label text-center font-normal">Score 1-5</th>
          <th className="label text-right font-normal">Points</th>
        </tr>
      </thead>
      <tbody>
        {CRITERIA.map((c) => (
          <tr key={c.key} className="align-top">
            <td className="py-0.5">
              {c.label} <span className="text-muted">({fmtNum(weights[c.key] * 100, 0)}%)</span>
              {reasons?.[c.key] && <span className="block text-xs text-muted">{reasons[c.key]}</span>}
            </td>
            <td className="py-0.5 text-center">
              <span className="inline-flex items-center gap-1">
                <button
                  aria-label={`Lower ${c.label}`}
                  onClick={() => onChange(c.key, scores[c.key] - 1)}
                  disabled={scores[c.key] <= 1}
                  className="h-5 w-5 border hairline leading-none disabled:text-rule"
                >
                  −
                </button>
                <span className="num w-4 text-center">{scores[c.key]}</span>
                <button
                  aria-label={`Raise ${c.label}`}
                  onClick={() => onChange(c.key, scores[c.key] + 1)}
                  disabled={scores[c.key] >= 5}
                  className="h-5 w-5 border hairline leading-none disabled:text-rule"
                >
                  +
                </button>
              </span>
            </td>
            <td className="num py-0.5 text-right">{fmtNum((scores[c.key] * weights[c.key] * 100) / 5, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FitBar({ fit, excluded }: { fit: number; excluded?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`num w-8 text-right font-medium ${excluded ? "text-muted line-through" : ""}`}>{fmtNum(fit, 0)}</span>
      <span className="relative h-1.5 w-20 bg-paper-2">
        <span className="absolute left-0 top-0 h-1.5" style={{ width: `${fit}%`, background: excluded ? "var(--color-rule)" : "var(--color-ink)" }} />
        <span className="absolute top-[-2px] h-2.5 w-px bg-accent" style={{ left: "75%" }} title="Shortlist threshold 75" />
      </span>
    </span>
  );
}

export const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};
