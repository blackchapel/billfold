"use client";
import { useState } from "react";
import type { ReportDto } from "@/types/bill";

const W = 640;
const H = 240;
const M = { left: 52, right: 8, top: 24, bottom: 30 };
const BAR_MAX = 24; // marks stay thin: never fill the whole slot
const GAP = 2; // the surface colour separates neighbours; no outline is drawn around a bar

/** A bar with a 4px rounded top and a square bottom, sitting on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

interface Props {
  trend: ReportDto["trend"];
  axis: ReportDto["axis"];
  selectedKey: string;
  /** Page the bars link to, e.g. "/org/reports". Clicking a bar opens that month. */
  hrefBase: string;
}

/**
 * Twelve months of totals as columns. One measure, one scale, no legend (the heading names it).
 * The chosen month is the accent colour and carries its value above the bar, so colour is never the only cue.
 * Every column is a link with a tooltip on hover and focus; the table under the chart holds every number.
 */
export function MonthlyChart({ trend, axis, selectedKey, hrefBase }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const band = plotW / trend.length;
  const barW = Math.min(BAR_MAX, band - GAP * 2);
  const y = (v: number) => M.top + plotH - (v / axis.max) * plotH;
  const hovered = trend.find((p) => p.key === active) ?? null;
  const hoveredIndex = hovered ? trend.indexOf(hovered) : -1;
  const short = (label: string) => label.slice(0, 3);

  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label="Total of bills per month, last 12 months">
        {axis.ticks.map((t) => (
          <g key={t.value}>
            <line x1={M.left} x2={W - M.right} y1={y(t.value)} y2={y(t.value)} stroke="var(--line)" strokeWidth={1} />
            <text x={M.left - 8} y={y(t.value)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>{t.label}</text>
          </g>
        ))}
        {trend.map((p, i) => {
          const cx = M.left + band * i + band / 2;
          const h = Math.max(0, plotH - (y(p.value) - M.top));
          const selected = p.key === selectedKey;
          const label = `${p.label}: ${p.count === 0 ? "no bills" : `${p.text} across ${p.count} ${p.count === 1 ? "bill" : "bills"}`}`;
          return (
            <a key={p.key} href={`${hrefBase}?period=${p.key}`} aria-label={label} aria-current={selected ? "true" : undefined}
              onMouseEnter={() => setActive(p.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(p.key)} onBlur={() => setActive(null)}>
              {/* the whole column is the hit area, much wider than the thin bar */}
              <rect x={cx - band / 2} y={M.top} width={band} height={plotH + M.bottom} fill="transparent" />
              {h > 0 && <path d={barPath(cx - barW / 2, y(p.value), barW, h)} fill={selected ? "var(--accent)" : "var(--muted)"} opacity={active && active !== p.key ? 0.55 : 1} />}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={11} fill={selected ? "var(--ink)" : "var(--muted)"} fontWeight={selected ? 600 : 400}>{short(p.label)}</text>
              {selected && h > 0 && <text x={cx} y={y(p.value) - 6} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--ink)" style={{ fontVariantNumeric: "tabular-nums" }}>{p.text.replace(/\.00$/, "")}</text>}
            </a>
          );
        })}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth={1} />
      </svg>
      {hovered && (
        <div role="tooltip" className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-3 py-2 text-xs"
          style={{ left: `${((M.left + band * hoveredIndex + band / 2) / W) * 100}%`, top: 0 }}>
          <p className="text-base font-semibold tabular-nums">{hovered.count === 0 ? "No bills" : hovered.text}</p>
          <p className="text-muted">{hovered.label}{hovered.count > 0 ? ` · ${hovered.count} ${hovered.count === 1 ? "bill" : "bills"}` : ""}</p>
          {hovered.missing > 0 && <p className="text-muted">{hovered.missing} without an amount</p>}
        </div>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer underline underline-offset-4">Show as a table</summary>
        <table className="mt-2 w-full max-w-md text-left text-sm">
          <caption className="sr-only">Total of bills per month</caption>
          <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-muted"><th scope="col" className="py-1.5 pr-4 font-medium">Month</th><th scope="col" className="py-1.5 pr-4 text-right font-medium">Bills</th><th scope="col" className="py-1.5 text-right font-medium">Total</th></tr></thead>
          <tbody>{trend.map((p) => (
            <tr key={p.key} className="border-b border-line"><th scope="row" className="py-1.5 pr-4 font-normal">{p.label}</th><td className="num py-1.5 pr-4">{p.count}</td><td className="num py-1.5">{p.text}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </figure>
  );
}
