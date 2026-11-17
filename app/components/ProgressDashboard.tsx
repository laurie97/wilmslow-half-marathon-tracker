"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatKm, formatPace, formatShortDate, stravaUrl } from "@/lib/format";
import type { ProgressResponse } from "@/lib/progress";
import { ralphSays } from "@/lib/ralph";
import {
  halfMarathons,
  seasonStats,
  type BestRun,
  type DistancePoint,
  type RunCounts,
} from "@/lib/stats";
import ErrorCard, { type ApiError } from "./ErrorCard";
import PoweredByStrava from "./PoweredByStrava";
import RaccoonLogo from "./RaccoonLogo";

/** The progress page: runs dial, cumulative distance and best runs. */
export default function ProgressDashboard() {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/progress", { cache: "no-store" });
      const body = await response.json();
      if (response.ok) {
        setData(body as ProgressResponse);
        setError(null);
      } else {
        setError(body as ApiError);
      }
    } catch {
      setError({ error: "network", message: "Couldn't load. Check your connection." });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data && loading) {
    const loadingPage = <main className="page loading">Loading your progress…</main>;
    return loadingPage;
  }

  const header = (
    <header className="top">
      <Link href="/" className="back-link">
        ‹ This week
      </Link>
      <h1>How it’s going</h1>
    </header>
  );

  if (!data || !data.plan || data.weeks.length === 0) {
    const emptyPage = (
      <main className="page">
        {header}
        {error ? (
          <ErrorCard error={error} onRetry={load} />
        ) : (
          <section className="card empty">
            <p className="muted">Upload a plan to see your progress.</p>
          </section>
        )}
        <PoweredByStrava />
      </main>
    );
    return emptyPage;
  }

  const stats = seasonStats(data.weeks, data.today);
  const page = (
    <main className="page">
      {header}
      {error && <ErrorCard error={error} onRetry={load} />}

      <section className="ralph-says" aria-label="Ralph says">
        <RaccoonLogo size={64} />
        <p className="speech">{ralphSays(stats.runs)}</p>
      </section>

      <section className="card panel">
        <h2>Runs done</h2>
        <RunsDial runs={stats.runs} />
      </section>

      <section className="card panel">
        <h2>Distance</h2>
        <DistanceSummary
          actual={stats.actualToDateKm}
          expected={stats.expectedToDateKm}
          total={stats.plannedTotalKm}
        />
        <DistanceChart points={stats.distance} today={data.today} />
      </section>

      <section className="bests" aria-label="Best runs">
        <BestTile label="Fastest intervals" best={stats.fastestIntervals} show="pace" />
        <BestTile label="Fastest tempo" best={stats.fastestTempo} show="pace" />
        <BestTile label="Longest run" best={stats.longestRun} show="distance" />
      </section>
      <p className="muted small bests-note">
        Paces are the average for the whole run, warm-up and recoveries included.
      </p>

      <MedalCard
        actualKm={stats.actualToDateKm}
        plannedKm={stats.plannedTotalKm}
        timeOnFeetS={stats.timeOnFeetS}
      />

      <PoweredByStrava />
    </main>
  );
  return page;
}

// Runs dial ---------------------------------------------------------------

const DIAL = { cx: 100, cy: 100, r: 80, width: 16 };

/** A point on the dial's half circle; f = 0 is the left end, 1 the right. */
function dialPoint(f: number, r = DIAL.r): [number, number] {
  const angle = Math.PI * (1 - f);
  const point: [number, number] = [
    DIAL.cx + r * Math.cos(angle),
    DIAL.cy - r * Math.sin(angle),
  ];
  return point;
}

/** SVG arc path along the dial from fraction `from` to `to`. */
function dialArc(from: number, to: number): string {
  const [x1, y1] = dialPoint(from);
  const [x2, y2] = dialPoint(to);
  const path = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${DIAL.r} ${DIAL.r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  return path;
}

/** Half-circle gauge: runs done and partly done out of all planned runs. */
function RunsDial({ runs }: { runs: RunCounts }) {
  const total = Math.max(runs.total, 1);
  const doneEnd = runs.done / total;
  const partialEnd = (runs.done + runs.partial) / total;
  const due = runs.due / total;
  const gap = 0.006; // 2px surface gap between segments
  const ran = runs.done + runs.partial;
  const [tickIn, tickOut] = [dialPoint(due, DIAL.r - 13), dialPoint(due, DIAL.r + 13)];
  const label = `${ran} of ${runs.total} planned runs done (${runs.done} in full, ${runs.partial} partly). ${runs.due} were due by today.`;
  const pace = runs.due > 0 ? Math.round((ran / runs.due) * 100) : null;

  const dial = (
    <div className="dial">
      <svg viewBox="0 0 200 116" role="img" aria-label={label}>
        <path d={dialArc(0, 1)} className="dial-track" strokeWidth={DIAL.width} />
        {runs.done > 0 && (
          <path
            d={dialArc(0, doneEnd)}
            className="dial-done"
            strokeWidth={DIAL.width}
          />
        )}
        {runs.partial > 0 && (
          <path
            d={dialArc(
              Math.min(doneEnd + (runs.done > 0 ? gap : 0), partialEnd),
              partialEnd,
            )}
            className="dial-partial"
            strokeWidth={DIAL.width}
          />
        )}
        {runs.due > 0 && (
          <line
            x1={tickIn[0]}
            y1={tickIn[1]}
            x2={tickOut[0]}
            y2={tickOut[1]}
            className="dial-tick"
          />
        )}
        <text x={DIAL.cx} y={DIAL.cy - 14} className="dial-value" textAnchor="middle">
          {ran}/{runs.total}
        </text>
        <text x={DIAL.cx} y={DIAL.cy + 4} className="dial-caption" textAnchor="middle">
          runs done
        </text>
      </svg>
      <ul className="legend">
        <li>
          <span className="key key-done" />
          {runs.done} done
        </li>
        <li>
          <span className="key key-partial" />
          {runs.partial} partial
        </li>
        <li>
          <span className="key key-tick" />
          {runs.due} due by today
        </li>
      </ul>
      {pace !== null && (
        <p className="muted small center">
          {pace}% of the runs due so far have been done.
        </p>
      )}
    </div>
  );
  return dial;
}

// Distance ----------------------------------------------------------------

/** "62.3 km of 70.0 km planned to date" with the gap either way. */
function DistanceSummary(props: { actual: number; expected: number; total: number }) {
  const diff = Math.round((props.actual - props.expected) * 10) / 10;
  const gap =
    diff === 0
      ? "right on plan"
      : `${Math.abs(diff).toFixed(1)} km ${diff > 0 ? "ahead" : "behind"}`;
  const summary = (
    <div className="distance-summary">
      <p>
        <strong className="figure">{props.actual.toFixed(1)}</strong> km run
      </p>
      <p className="muted small">
        {props.expected.toFixed(1)} km planned by today ({gap}) ·{" "}
        {props.total.toFixed(0)} km in the whole plan
      </p>
    </div>
  );
  return summary;
}

const CHART = { width: 340, height: 200, left: 34, right: 12, top: 12, bottom: 24 };

/** A clean axis step giving roughly four ticks up to `max`. */
function niceStep(max: number): number {
  const raw = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return step;
}

/** Cumulative km run against cumulative km planned, one point per day. */
function DistanceChart({ points, today }: { points: DistancePoint[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const maxKm = Math.max(
    ...points.map((p) => Math.max(p.expectedKm, p.actualKm ?? 0)),
    1,
  );
  const step = niceStep(maxKm);
  const top = Math.ceil(maxKm / step) * step;
  const plotW = CHART.width - CHART.left - CHART.right;
  const plotH = CHART.height - CHART.top - CHART.bottom;
  const x = (i: number): number => CHART.left + (n > 1 ? (i / (n - 1)) * plotW : 0);
  const y = (km: number): number => CHART.top + plotH - (km / top) * plotH;
  const baseline = y(0);

  const expectedPath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.expectedKm).toFixed(1)}`,
    )
    .join(" ");
  const done = points.filter((p) => p.actualKm !== null);
  const lastDone = done.length - 1;
  const actualPath = done
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.actualKm ?? 0).toFixed(1)}`,
    )
    .join(" ");
  const actualArea =
    lastDone >= 0
      ? `${actualPath} L ${x(lastDone).toFixed(1)} ${baseline} L ${x(0)} ${baseline} Z`
      : "";

  const yTicks: number[] = [];
  for (let km = 0; km <= top + 1e-9; km += step) yTicks.push(km);
  const weekStarts = points
    .map((p, i) => ({ date: p.date, i }))
    .filter((_, i) => i % 7 === 0);
  const every = Math.max(1, Math.ceil(weekStarts.length / 5));
  const xTicks = weekStarts.filter((_, k) => k % every === 0);
  const todayIndex = points.findIndex((p) => p.date === today);

  /** Snaps the crosshair to the nearest day under the pointer. */
  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * CHART.width;
    const index = Math.round(((svgX - CHART.left) / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, index)));
  };
  const hovered = hover !== null ? points[hover] : null;
  const tipLeft = hover !== null ? (x(hover) / CHART.width) * 100 : 0;

  const chart = (
    <div className="chart">
      <ul className="legend">
        <li>
          <span className="line-key line-actual" />
          Run
        </li>
        <li>
          <span className="line-key line-expected" />
          Planned
        </li>
      </ul>
      <div className="chart-frame">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label="Cumulative distance run compared with the plan"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((km) => (
            <g key={km}>
              <line
                x1={CHART.left}
                x2={CHART.width - CHART.right}
                y1={y(km)}
                y2={y(km)}
                className="grid"
              />
              <text
                x={CHART.left - 6}
                y={y(km) + 3.5}
                className="tick"
                textAnchor="end"
              >
                {km}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={t.date}
              x={x(t.i)}
              y={CHART.height - 6}
              className="tick"
              textAnchor={t.i === 0 ? "start" : "middle"}
            >
              {formatShortDate(t.date)}
            </text>
          ))}
          {todayIndex >= 0 && (
            <g>
              <line
                x1={x(todayIndex)}
                x2={x(todayIndex)}
                y1={CHART.top}
                y2={baseline}
                className="today-line"
              />
              <text
                x={x(todayIndex) + (todayIndex > n * 0.8 ? -4 : 4)}
                y={CHART.top + 9}
                className="tick"
                textAnchor={todayIndex > n * 0.8 ? "end" : "start"}
              >
                Today
              </text>
            </g>
          )}
          <path d={expectedPath} className="line-expected-path" />
          {actualArea && <path d={actualArea} className="area-actual" />}
          {actualPath && <path d={actualPath} className="line-actual-path" />}
          {lastDone >= 0 && (
            <circle
              cx={x(lastDone)}
              cy={y(done[lastDone].actualKm ?? 0)}
              r={4.5}
              className="end-dot"
            />
          )}
          {hover !== null && hovered && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={CHART.top}
                y2={baseline}
                className="crosshair"
              />
              {hovered.actualKm !== null && (
                <circle
                  cx={x(hover)}
                  cy={y(hovered.actualKm)}
                  r={4}
                  className="end-dot"
                />
              )}
              <circle
                cx={x(hover)}
                cy={y(hovered.expectedKm)}
                r={4}
                className="expected-dot"
              />
            </g>
          )}
        </svg>
        {hovered && (
          <div
            className="tooltip"
            style={{
              left: `${tipLeft}%`,
              transform: `translateX(${tipLeft > 60 ? "-105%" : "5%"})`,
            }}
          >
            <p className="tooltip-date">{formatShortDate(hovered.date)}</p>
            {hovered.actualKm !== null && (
              <p>
                <span className="line-key line-actual" />
                <strong>{hovered.actualKm.toFixed(1)} km</strong> run
              </p>
            )}
            <p>
              <span className="line-key line-expected" />
              <strong>{hovered.expectedKm.toFixed(1)} km</strong> planned
            </p>
          </div>
        )}
      </div>
      <DistanceTable points={points} />
    </div>
  );
  return chart;
}

/** The chart's figures at the end of each week, for reading without hovering. */
function DistanceTable({ points }: { points: DistancePoint[] }) {
  const weekEnds = points.filter((_, i) => i % 7 === 6);
  const table = (
    <details className="chart-table">
      <summary>Show as a table</summary>
      <table>
        <thead>
          <tr>
            <th>Week ending</th>
            <th>Run</th>
            <th>Planned</th>
          </tr>
        </thead>
        <tbody>
          {weekEnds.map((p) => (
            <tr key={p.date}>
              <td>{formatShortDate(p.date)}</td>
              <td>{p.actualKm === null ? "–" : `${p.actualKm.toFixed(1)} km`}</td>
              <td>{p.expectedKm.toFixed(1)} km</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
  return table;
}

// Best runs ---------------------------------------------------------------

/** One record: the headline figure, the session and a View on Strava link. */
function BestTile({
  label,
  best,
  show,
}: {
  label: string;
  best: BestRun | null;
  show: "pace" | "distance";
}) {
  const roundedKm = Math.round((best?.distanceKm ?? 0) * 10) / 10;
  const pace = best ? formatPace(best.movingTimeS, best.distanceKm) : "";
  const tile = (
    <article className="card best">
      <p className="best-label">{label}</p>
      {best ? (
        <>
          <p className="best-value">{show === "pace" ? pace : formatKm(roundedKm)}</p>
          <p className="best-title">{best.title}</p>
          <p className="muted small">
            {formatShortDate(best.date)} ·{" "}
            {show === "pace" ? formatKm(roundedKm) : pace}
          </p>
          <a
            className="view-on-strava"
            href={stravaUrl(best.activities[0].id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Strava
          </a>
        </>
      ) : (
        <p className="muted small">Nothing run yet</p>
      )}
    </article>
  );
  return tile;
}

// Half marathons' worth -----------------------------------------------------

const MEDAL_LIMIT = 40; // beyond this, the row would be too long to read

/** "6 h 12 min" from seconds. */
function formatHours(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const text =
    minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return text;
}

/** One medal, filled from the bottom up by `fill` (0-1). */
function Medal({ fill, id }: { fill: number; id: string }) {
  const clipTop = 33 - 20 * fill; // the disc spans y = 13 to 33
  const medal = (
    <svg viewBox="0 0 32 36" className="medal" aria-hidden="true">
      <path d="M9 1 L14 13 L18 13 L23 1 Z" className="medal-ribbon" />
      <circle cx="16" cy="23" r="10" className="medal-empty" />
      {fill > 0 && (
        <>
          <clipPath id={id}>
            <rect x="0" y={clipTop} width="32" height={36 - clipTop} />
          </clipPath>
          <circle
            cx="16"
            cy="23"
            r="10"
            className="medal-gold"
            clipPath={`url(#${id})`}
          />
        </>
      )}
      {fill >= 1 && (
        <path
          d="M16 17.5 l1.7 3.4 3.7 .5 -2.7 2.6 .7 3.7 -3.4 -1.8 -3.4 1.8 .7 -3.7 -2.7 -2.6 3.7 -.5 z"
          className="medal-star"
        />
      )}
    </svg>
  );
  return medal;
}

/** Distance run so far, counted in half marathons, as a row of medals. */
function MedalCard(props: {
  actualKm: number;
  plannedKm: number;
  timeOnFeetS: number;
}) {
  const done = halfMarathons(props.actualKm);
  const planned = halfMarathons(props.plannedKm);
  const slots = Math.min(Math.ceil(Math.max(done, planned, 1)), MEDAL_LIMIT);
  const whole = Math.floor(done);
  const label = `${done.toFixed(1)} half marathons run so far, of ${planned.toFixed(1)} in the whole plan.`;
  const card = (
    <section className="card panel medals-card">
      <h2>Half marathons’ worth</h2>
      <p>
        <strong className="figure">{done.toFixed(1)}</strong> half marathons run
      </p>
      <p className="muted small">
        {whole > 0
          ? `That’s the Wilmslow Half ${whole === 1 ? "once" : whole === 2 ? "twice" : `${whole} times`} over`
          : `${Math.round(done * 100)}% of the way to your first one`}
        , in {formatHours(props.timeOnFeetS)} on your feet. The whole plan adds up to{" "}
        {planned.toFixed(1)}.
      </p>
      <div className="medals" role="img" aria-label={label}>
        {Array.from({ length: slots }, (_, i) => (
          <Medal key={i} id={`medal-${i}`} fill={Math.min(Math.max(done - i, 0), 1)} />
        ))}
      </div>
    </section>
  );
  return card;
}
