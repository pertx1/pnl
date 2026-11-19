"use client";

import { useMemo, useRef, useState } from "react";
import { useFormatter } from "next-intl";

/**
 * Gráfica de área de UNA serie (sin leyenda: el título la nombra), línea de 2 px, rejilla discreta,
 * cruceta + tooltip al pasar el ratón o con el teclado. Color: --chart-1 (validado por modo en globals.css).
 */
export function AreaChart({ points, label, height = 180 }: { points: { day: string; value: number }[]; label: string; height?: number }) {
  const format = useFormatter();
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = { t: 12, r: 8, b: 22, l: 44 };

  const { path, area, xs, ys, ticks } = useMemo(() => {
    const vals = points.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const lo = min === max ? min * 0.9 : min - (max - min) * 0.1;
    const hi = min === max ? max * 1.1 + 1 : max + (max - min) * 0.1;
    const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(points.length - 1, 1);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
    const xs = points.map((_, i) => x(i));
    const ys = points.map((p) => y(p.value));
    const path = xs.map((px, i) => `${i ? "L" : "M"}${px.toFixed(1)},${ys[i].toFixed(1)}`).join("");
    const area = `${path}L${xs.at(-1)},${H - pad.b}L${xs[0]},${H - pad.b}Z`;
    const ticks = [0, 0.5, 1].map((f) => ({ v: lo + (hi - lo) * f, y: y(lo + (hi - lo) * f) }));
    return { path, area, xs, ys, ticks };
  }, [points, H, pad.b, pad.l, pad.r, pad.t]);

  if (points.length < 2) return null;

  function onMove(clientX: number) {
    const rect = ref.current!.getBoundingClientRect();
    const xv = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    xs.forEach((px, i) => {
      if (Math.abs(px - xv) < Math.abs(xs[best] - xv)) best = i;
    });
    setHover(best);
  }

  const h = hover !== null ? points[hover] : null;
  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={label}
        tabIndex={0}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((i) => Math.min((i ?? -1) + 1, points.length - 1));
          if (e.key === "ArrowLeft") setHover((i) => Math.max((i ?? points.length) - 1, 0));
        }}
        onBlur={() => setHover(null)}
      >
        <defs>
          <linearGradient id="kreo-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.25" />
            <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tk, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={tk.y} y2={tk.y} stroke="var(--border)" strokeDasharray="2 4" />
            <text x={pad.l - 6} y={tk.y + 3} textAnchor="end" className="fill-muted-foreground font-mono" fontSize="10">
              {format.number(Math.round(tk.v), { notation: "compact" })}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#kreo-area)" />
        <path d={path} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {[0, points.length - 1].map((i) => (
          <text key={i} x={xs[i]} y={H - 6} textAnchor={i ? "end" : "start"} className="fill-muted-foreground font-mono" fontSize="10">
            {format.dateTime(new Date(points[i].day), { day: "numeric", month: "short" })}
          </text>
        ))}
        {hover !== null && (
          <g>
            <line x1={xs[hover]} x2={xs[hover]} y1={pad.t} y2={H - pad.b} stroke="var(--muted-foreground)" strokeWidth={1} />
            <circle cx={xs[hover]} cy={ys[hover]} r={4.5} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs shadow-lg"
          style={{ left: `${(xs[hover!] / W) * 100}%`, transform: xs[hover!] > W / 2 ? "translateX(-105%)" : "translateX(5%)" }}
        >
          <div className="text-muted-foreground">{format.dateTime(new Date(h.day), { dateStyle: "medium" })}</div>
          <div className="font-mono font-semibold tabular-nums">{format.number(h.value)}</div>
        </div>
      )}
    </div>
  );
}
