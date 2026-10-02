"use client";

import { useState } from "react";
import { useAlertState } from "@/lib/alertStore";
import { dataset } from "@/lib/data";
import { PRESETS } from "@/lib/presets";

const SOURCE_TYPES = ["Report", "Authority bulletin", "Aggregator repost"];
const SEVERITIES: { v: string; label: string }[] = [
  { v: "", label: "Auto (from the text)" },
  { v: "1", label: "1.0 confirmed disruption" },
  { v: "0.7", label: "0.7 credible precursor" },
  { v: "0.4", label: "0.4 logistics delay" },
  { v: "0.1", label: "0.1 administrative" },
];

/** Judge-facing form: any new event runs through the same live pipeline. */
export function SimulateEvent() {
  const addEvent = useAlertState((s) => s.addEvent);
  const today = dataset.assumptions.dates.caseCutoff;
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [published, setPublished] = useState(today);
  const [effective, setEffective] = useState(today);
  const [family, setFamily] = useState("");
  const [sourceType, setSourceType] = useState(SOURCE_TYPES[0]);
  const [severity, setSeverity] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addEvent({
      title: title.trim(),
      text: text.trim(),
      published,
      effective,
      sourceFamily: family.trim(),
      sourceType,
      severityOverride: severity ? Number(severity) : null,
    });
  };

  return (
    <section className="border hairline p-4" aria-labelledby="sim-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sim-title" className="serif text-base">
          Simulate a new event
        </h2>
        <p className="text-xs text-muted">Matching is rule-based and explains every decision; nothing is guessed.</p>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => addEvent({ ...p.event })}
            title={p.expect}
            className="border border-accent px-2 py-1 text-xs text-accent hover:bg-accent hover:text-paper"
          >
            {p.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-3 grid gap-3 text-[13px] md:grid-cols-[2fr_1fr_1fr]">
        <label className="flex flex-col gap-0.5 md:col-span-1">
          <span className="label">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Typhoon warning for Z04" className="border-b hairline bg-transparent py-1" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="label">Published</span>
          <input type="date" value={published} onChange={(e) => setPublished(e.target.value)} className="border-b hairline bg-transparent py-1" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="label">Effective</span>
          <input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} className="border-b hairline bg-transparent py-1" />
        </label>
        <label className="flex flex-col gap-0.5 md:row-span-2">
          <span className="label">Event text</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Free text as published" className="border hairline bg-transparent p-1.5" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="label">Source family</span>
          <input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="blank = check title similarity" className="border-b hairline bg-transparent py-1" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="label">Source type</span>
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="border-b hairline bg-transparent py-1">
            {SOURCE_TYPES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="label">Severity</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="border-b hairline bg-transparent py-1">
            {SEVERITIES.map((s) => (
              <option key={s.v} value={s.v}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="border border-ink bg-ink px-3 py-1.5 text-paper hover:bg-accent hover:border-accent">
            Run the pipeline
          </button>
        </div>
      </form>
    </section>
  );
}
