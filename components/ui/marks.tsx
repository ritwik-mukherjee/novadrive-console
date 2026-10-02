import type { Band, ConfidenceLabel } from "@/lib/engine";

export const BAND_VAR: Record<Band, string> = {
  Critical: "var(--color-critical)",
  High: "var(--color-high)",
  Elevated: "var(--color-elevated)",
  Watch: "var(--color-watch)",
};

/** Colour swatch + band word (colour is never the only signal). */
export function BandChip({ band, className = "" }: { band: Band; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: BAND_VAR[band] }} />
      <span>{band}</span>
    </span>
  );
}

/** Left half of a disc, for "Medium" confidence. */
export function halfDiscPath(cx: number, cy: number, r: number) {
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} Z`;
}

/** Confidence is shown by marker fill only: solid = High, half = Medium, hollow = Low. */
export function ConfidenceMarker({
  label,
  size = 10,
  showText = false,
}: {
  label: ConfidenceLabel;
  size?: number;
  showText?: boolean;
}) {
  const r = size / 2 - 1;
  const c = size / 2;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`${label} confidence`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {label === "High" && <circle cx={c} cy={c} r={r} fill="var(--color-ink)" />}
        {label === "Medium" && <path d={halfDiscPath(c, c, r)} fill="var(--color-ink)" />}
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--color-ink)" strokeWidth={1.2} />
      </svg>
      {showText ? <span>{label}</span> : <span className="sr-only">{label} confidence</span>}
    </span>
  );
}

export function TierLabel({ tier }: { tier: number }) {
  return <span className="num">T{tier}</span>;
}
