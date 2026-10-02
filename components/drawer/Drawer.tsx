"use client";

import { useEffect, useRef } from "react";
import { useDrawer } from "@/lib/drawer";
import { CandidateDrawer } from "./CandidateDrawer";
import { EventDrawer } from "./EventDrawer";
import { LinkDrawer } from "./LinkDrawer";
import { NodeDrawer } from "./NodeDrawer";

/** Right-hand drawer, mounted once in the root layout. */
export function Drawer() {
  const { target, history, back, close } = useDrawer();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target) return;
    panel.current?.focus();
    panel.current?.scrollTo({ top: 0 });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  if (!target) return null;
  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label="Details"
      className="fixed inset-y-0 right-0 z-50 w-[min(480px,100vw)] overflow-y-auto border-l border-ink bg-paper px-6 pb-10 pt-4 focus:outline-none"
    >
      <div className="mb-3 flex items-center justify-between text-xs">
        {history.length > 0 ? (
          <button onClick={back} className="text-muted hover:text-ink">
            ← Back
          </button>
        ) : (
          <span />
        )}
        <button onClick={close} className="text-muted hover:text-ink" aria-label="Close details">
          Close ✕
        </button>
      </div>
      {target.kind === "node" && <NodeDrawer id={target.id} />}
      {target.kind === "link" && <LinkDrawer id={target.id} />}
      {target.kind === "event" && <EventDrawer id={target.id} />}
      {target.kind === "candidate" && <CandidateDrawer id={target.id} />}
    </div>
  );
}
