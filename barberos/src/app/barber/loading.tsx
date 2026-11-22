export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex animate-pulse flex-col gap-4">
      <div className="h-8 w-40 rounded-md bg-surface-muted" />
      <div className="h-20 rounded-xl border border-border bg-surface" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-xl border border-border bg-surface" />
      ))}
    </div>
  );
}
