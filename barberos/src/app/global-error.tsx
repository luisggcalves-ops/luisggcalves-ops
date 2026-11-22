"use client";

/** Last-resort error screen if even the root layout fails. It has to bring its own <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f6f6f7", color: "#0a0a0b" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>BarberOS hit a problem</h1>
          <p style={{ color: "#55555e", fontSize: 14 }}>Please try again. If it keeps happening, contact support.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 8, border: "1px solid #d2d2d7", background: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
