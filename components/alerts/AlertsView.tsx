"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAlertFeed, useAlertState } from "@/lib/alertStore";
import { fmtNum } from "@/lib/format";
import { EventDetail } from "./EventDetail";
import { LevelChip } from "./LevelChip";
import { SimulateEvent } from "./SimulateEvent";

export function AlertsView() {
  const feed = useAlertFeed();
  const { selected, select, simulated, clearSimulated, statuses } = useAlertState();
  const params = useSearchParams();
  const fromUrl = params.get("event");
  useEffect(() => {
    if (fromUrl) select(fromUrl);
  }, [fromUrl, select]);

  // Simulated first (newest on top), then the case feed in order
  const ordered = [...feed.filter((f) => f.event.simulated).reverse(), ...feed.filter((f) => !f.event.simulated)];
  const current = feed.find((f) => f.event.id === selected) ?? feed[0];

  return (
    <div className="space-y-6">
      <SimulateEvent />

      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <section aria-label="Event feed">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="label">Event feed ({feed.length})</h2>
            {simulated.length > 0 && (
              <button onClick={clearSimulated} className="text-xs text-muted hover:text-ink">
                Clear typed-in events
              </button>
            )}
          </div>
          <ul className="border-t hairline">
            {ordered.map((f) => {
              const on = f.event.id === current?.event.id;
              return (
                <li key={f.event.id} className="border-b hairline">
                  <button
                    onClick={() => select(f.event.id)}
                    aria-current={on ? "true" : undefined}
                    className={`w-full border-l-2 px-2 py-2 text-left ${on ? "border-accent bg-paper-2" : "border-transparent hover:bg-paper-2"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <LevelChip level={f.alert.level} label={f.alert.levelLabel} provisional={f.provisional} />
                      <span className="num text-xs text-muted">{fmtNum(f.alert.score, 1)}</span>
                    </div>
                    <div className="mt-1 text-[13px]">
                      <span className="num text-muted">{f.event.id}</span> {f.event.title}
                    </div>
                    <div className="text-xs text-muted">
                      {f.event.simulated ? "typed in" : f.event.published} · {statuses[f.event.id] ?? "New"}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Selected event">{current && <EventDetail item={current} />}</section>
      </div>
    </div>
  );
}
