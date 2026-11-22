"use client";

import { useState } from "react";
import { formatDateLabel } from "@/lib/time";

/**
 * Daily revenue as columns: a single series in the brand ink, with no legend
 * (the title names it). Columns are at most 24px wide, with a 4px rounded top and
 * a square baseline. Hairline gridlines at clean ticks. Each day's whole band is
 * the hover/focus target and shows a tooltip. The table view below the chart
 * keeps every value reachable without hovering.
 */
export function RevenueChart({ daily, format }: { daily: { date: string; cents: number }[]; format: "eur" | string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const money = (c: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: format, maximumFractionDigits: 0 }).format(c / 100);
  const max = Math.max(...daily.map((d) => d.cents), 0);
  const step = niceStep(max / 100);
  const top = Math.max(step * 4, Math.ceil(max / 100 / step) * step) * 100;
  const ticks = [0, 1, 2, 3, 4].map((i) => (top / 4) * i);
  const W = 720;
  const H = 220;
  const pad = { l: 48, r: 8, t: 8, b: 24 };
  const band = (W - pad.l - pad.r) / Math.max(daily.length, 1);
  const barW = Math.min(24, Math.max(3, band - 2));
  const y = (c: number) => pad.t + (H - pad.t - pad.b) * (1 - c / top);
  const labelEvery = Math.ceil(daily.length / 10);

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Revenue per day">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--fg-subtle)] text-[11px] tabular">
                {money(t)}
              </text>
            </g>
          ))}
          {daily.map((d, i) => {
            const x = pad.l + band * i + (band - barW) / 2;
            const h = Math.max(0, y(0) - y(d.cents));
            const r = Math.min(4, h, barW / 2);
            return (
              <g
                key={d.date}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${formatDateLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}: ${money(d.cents)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
                {h > 0 ? (
                  <path
                    d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`}
                    fill={hover === i ? "var(--fg-muted)" : "var(--fg)"}
                  />
                ) : null}
                {i % labelEvery === 0 ? (
                  <text x={pad.l + band * i + band / 2} y={H - 6} textAnchor="middle" className="fill-[var(--fg-subtle)] text-[11px] tabular">
                    {Number(d.date.slice(8))}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth={1} />
        </svg>
        {hover !== null && daily[hover] ? (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] shadow-pop"
            style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%`, top: `${(y(daily[hover].cents) / H) * 100}%` }}
          >
            <div className="text-fg-muted">{formatDateLabel(daily[hover].date, { weekday: "short", day: "numeric", month: "short" })}</div>
            <div className="font-semibold tabular">{money(daily[hover].cents)}</div>
          </div>
        ) : null}
      </div>
      <button type="button" onClick={() => setShowTable((v) => !v)} className="mt-2 text-[12px] text-fg-muted hover:text-fg">
        {showTable ? "Hide table" : "Show as table"}
      </button>
      {showTable ? (
        <table className="mt-2 w-full text-[13px]">
          <tbody className="divide-y divide-border">
            {daily.map((d) => (
              <tr key={d.date}>
                <td className="py-1 text-fg-muted">{formatDateLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}</td>
                <td className="py-1 text-right tabular">{money(d.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 25;
  const pow = 10 ** Math.floor(Math.log10(raw / 4));
  for (const m of [1, 2, 2.5, 5, 10]) if ((raw / 4) <= m * pow) return m * pow;
  return 10 * pow;
}
