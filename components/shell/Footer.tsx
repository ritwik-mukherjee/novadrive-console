import { fmtDate } from "@/lib/format";

export function Footer({ caseCutoff, researchAsOf }: { caseCutoff: string; researchAsOf: string }) {
  return (
    <footer className="flex flex-wrap justify-between gap-2 border-t hairline px-8 py-3 text-xs text-muted">
      <span>
        Network, scores and alerts as at <span className="num text-ink">{fmtDate(caseCutoff)}</span> (case cut-off)
        <span className="mx-2">·</span>
        Alternate suppliers as at <span className="num text-ink">{fmtDate(researchAsOf)}</span> (current public sources)
      </span>
      <span>Source: case data; team analysis</span>
    </footer>
  );
}
