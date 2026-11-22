/** Shown instantly while a dashboard page loads: a calm skeleton, not a spinner. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-7 w-48 rounded-md bg-surface-muted" />
      <div className="mt-2 h-4 w-72 rounded-md bg-surface-muted" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-border bg-surface" />
        ))}
      </div>
      <div className="mt-6 h-72 rounded-xl border border-border bg-surface" />
    </div>
  );
}
