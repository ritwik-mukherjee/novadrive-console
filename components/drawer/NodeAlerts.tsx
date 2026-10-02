"use client";

import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import { fmtNum } from "@/lib/format";
import { useModel } from "@/lib/weights";

/** Case events whose primary node is this node (step 6 extends this to zone matches and simulated events). */
export function NodeAlerts({ nodeId }: { nodeId: string }) {
  const { model } = useModel();
  const open = useDrawer((s) => s.open);
  const hits = dataset.events.filter((e) => e.primaryNode === nodeId);
  if (hits.length === 0) return <p className="text-muted">No alert in the feed names this node.</p>;
  return (
    <ul className="space-y-1">
      {hits.map((e) => {
        const r = model.alerts.find((a) => a.id === e.id)!;
        return (
          <li key={e.id}>
            <button className="text-left hover:underline" onClick={() => open({ kind: "event", id: e.id })}>
              <span className="num">{e.id}</span> {e.title} · <span className="font-medium">{r.levelLabel}</span>{" "}
              <span className="num text-muted">{fmtNum(r.score)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
