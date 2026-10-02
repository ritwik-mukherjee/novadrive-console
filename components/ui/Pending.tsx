export function Pending({ step, what }: { step: number; what: string }) {
  return (
    <section className="max-w-xl border-t hairline pt-4">
      <p className="label">Build plan step {step}</p>
      <p className="mt-1 text-muted">{what}</p>
    </section>
  );
}
