"use client";

import { LevelChip } from "@/components/alerts/LevelChip";
import { useAlertFeed } from "@/lib/alertStore";
import { useDrawer } from "@/lib/drawer";
import { fmtNum } from "@/lib/format";

/** Every feed event (case or typed-in) whose match touches this node. */
export function NodeAlerts({ nodeId }: { nodeId: string }) {
  const feed = useAlertFeed();
  const open = useDrawer((s) => s.open);
  const hits = feed.filter((f) => f.match.primaryNode === nodeId || f.match.matchedNodes.includes(nodeId));
  if (hits.length === 0) return <p className="text-muted">No event in the feed touches this node.</p>;
  return (
    <ul className="space-y-1.5">
      {hits.map((f) => (
        <li key={f.event.id} className="flex flex-wrap items-center gap-2">
          <LevelChip level={f.alert.level} label={f.alert.levelLabel} provisional={f.provisional} />
          <button className="text-left hover:underline" onClick={() => open({ kind: "event", id: f.event.id })}>
            <span className="num">{f.event.id}</span> {f.event.title}
          </button>
          <span className="num text-xs text-muted">
            {fmtNum(f.alert.score, 1)}
            {f.match.primaryNode === nodeId ? " · primary" : " · zone match"}
          </span>
        </li>
      ))}
    </ul>
  );
}
