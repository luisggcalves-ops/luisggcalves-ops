/** Shown on every screen of a demo shop, so sample data is never mistaken for real business data. */
export function DemoBanner() {
  return (
    <div role="note" className="bg-warning-bg px-4 py-1.5 text-center text-[12px] font-medium text-warning">
      Demo shop: all customers, bookings and figures here are sample data.
    </div>
  );
}
