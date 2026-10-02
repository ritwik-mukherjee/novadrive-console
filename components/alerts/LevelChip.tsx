import type { AlertLevel } from "@/lib/engine";

const STYLE: Record<AlertLevel, { bg?: string; border: string; text: string }> = {
  HIGH: { bg: "var(--color-critical)", border: "var(--color-critical)", text: "var(--color-paper)" },
  MEDIUM: { bg: "var(--color-high)", border: "var(--color-high)", text: "var(--color-ink)" },
  "LOW – verify": { bg: "var(--color-elevated)", border: "var(--color-elevated)", text: "var(--color-ink)" },
  "LOG only": { border: "var(--color-watch)", text: "var(--color-muted)" },
  MERGED: { border: "var(--color-rule)", text: "var(--color-muted)" },
  "SUPPRESS – stale": { border: "var(--color-rule)", text: "var(--color-muted)" },
  "SUPPRESS – wrong entity": { border: "var(--color-rule)", text: "var(--color-muted)" },
};

/** Alert level: always the word, colour only as a second signal. */
export function LevelChip({ level, label, provisional }: { level: AlertLevel; label?: string; provisional?: boolean }) {
  const s = STYLE[level];
  return (
    <span
      className="inline-block whitespace-nowrap border px-1.5 py-px text-[11px] font-medium"
      style={{ background: s.bg ?? "transparent", borderColor: s.border, color: s.text, borderStyle: provisional ? "dashed" : "solid" }}
      title={provisional ? "Provisional: an ambiguous mention is waiting for your choice" : undefined}
    >
      {label ?? level}
      {provisional ? " ?" : ""}
    </span>
  );
}
