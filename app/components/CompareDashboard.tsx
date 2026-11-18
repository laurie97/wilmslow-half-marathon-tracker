"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CompareAthlete, CompareResponse } from "@/lib/compare";
import { formatShortDate } from "@/lib/format";
import { CHART, PLOT_H, indexAt, niceAxis, weekTicks, xAt } from "./chart";
import ErrorCard, { type ApiError } from "./ErrorCard";
import PoweredByStrava from "./PoweredByStrava";

const SERIES_SLOTS = 8; // distinct colours; anyone beyond shares a grey
const LABEL_LIMIT = 4; // direct line labels only while they stay readable
const LABEL_GAP = 11;

/** The CSS colour for an athlete's colour slot. */
function seriesColour(slot: number): string {
  const colour =
    slot < SERIES_SLOTS ? `var(--series-${slot + 1})` : "var(--series-other)";
  return colour;
}

/** "Alex (you)" or "Sam". */
function displayName(athlete: CompareAthlete): string {
  const name = athlete.isYou ? `${athlete.name} (you)` : athlete.name;
  return name;
}

/** The axis reference for the distance chart: the viewer's plan total, else the largest. */
function planTotal(athletes: CompareAthlete[]): { value: number; label: string } {
  const you = athletes.find((a) => a.isYou);
  const value =
    you?.plannedTotalKm ?? Math.max(...athletes.map((a) => a.plannedTotalKm));
  const reference = {
    value,
    label: `${you ? "Your plan" : "Plan"} ${Math.round(value)} km`,
  };
  return reference;
}

/** The compare page: every athlete's runs done, strength sessions and distance. */
export default function CompareDashboard() {
  const [data, setData] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/compare", { cache: "no-store" });
      const body = await response.json();
      if (response.ok) {
        setData(body as CompareResponse);
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
    const loadingPage = <main className="page loading">Loading everyone’s runs…</main>;
    return loadingPage;
  }

  const header = (
    <header className="top">
      <Link href="/progress" className="back-link">
        ‹ Progress
      </Link>
      <h1>Compare athletes</h1>
    </header>
  );

  if (!data || data.athletes.length === 0) {
    const emptyPage = (
      <main className="page">
        {header}
        {error ? (
          <ErrorCard error={error} onRetry={load} />
        ) : (
          <section className="card empty">
            <p className="muted">Nobody has uploaded a plan yet.</p>
          </section>
        )}
        <PoweredByStrava />
      </main>
    );
    return emptyPage;
  }

  const withStrength = data.athletes.filter((a) => a.strengthTotal > 0);
  const reference = planTotal(data.athletes);
  const page = (
    <main className="page">
      {header}
      {error && <ErrorCard error={error} onRetry={load} />}

      <section className="card panel">
        <h2>Where everyone is</h2>
        <CompareTable athletes={data.athletes} showStrength={withStrength.length > 0} />
        {data.unavailable.length > 0 && (
          <p className="muted small chart-note">
            Couldn’t load {data.unavailable.join(", ")} from Strava just now.
          </p>
        )}
      </section>

      <section className="card panel">
        <h2>Runs done</h2>
        <MultiLineChart
          dates={data.dates}
          today={data.today}
          athletes={data.athletes}
          values={(a) => a.runsPct}
          format={(v) => `${Math.round(v)}%`}
          tick={(v) => `${v}%`}
          yMax={100}
          label="Share of each athlete’s planned runs done, over time"
          tableHeading="Runs done"
        />
        <p className="muted small chart-note">
          Runs done in full or partly, as a share of all the runs in each athlete’s
          plan.
        </p>
      </section>

      {withStrength.length > 0 && (
        <section className="card panel">
          <h2>Strength sessions</h2>
          <MultiLineChart
            dates={data.dates}
            today={data.today}
            athletes={withStrength}
            values={(a) => a.strengthPct}
            format={(v) => `${Math.round(v)}%`}
            tick={(v) => `${v}%`}
            yMax={100}
            label="Share of each athlete’s planned strength sessions done, over time"
            tableHeading="Strength sessions"
          />
          <p className="muted small chart-note">
            Strength sessions ticked as done or partly done, as a share of all the
            strength sessions in each athlete’s plan. Each counts on its planned day.
          </p>
        </section>
      )}

      <section className="card panel">
        <h2>Distance</h2>
        <MultiLineChart
          dates={data.dates}
          today={data.today}
          athletes={data.athletes}
          values={(a) => a.distanceKm}
          format={(v) => `${v.toFixed(1)} km`}
          tick={(v) => `${v}`}
          yMax={Math.max(...data.athletes.map((a) => a.plannedTotalKm))}
          reference={reference}
          label="Cumulative distance run by each athlete, over time, up to the plan’s total"
          tableHeading="Distance"
        />
        <p className="muted small chart-note">
          Every run from the first week of each athlete’s plan, matched to a session or
          not. The axis goes up to the whole plan’s distance.
        </p>
      </section>

      <PoweredByStrava />
    </main>
  );
  return page;
}

// Summary table ------------------------------------------------------------

/** Whole-number % of `done` out of `total`, or 0 with nothing planned. */
function percent(done: number, total: number): number {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return pct;
}

/** One row per athlete: runs done, strength sessions done and distance so far. */
function CompareTable({
  athletes,
  showStrength,
}: {
  athletes: CompareAthlete[];
  showStrength: boolean;
}) {
  const table = (
    <table className="compare-table">
      <thead>
        <tr>
          <th>Athlete</th>
          <th>Runs</th>
          {showStrength && <th>Strength</th>}
          <th>Distance</th>
        </tr>
      </thead>
      <tbody>
        {athletes.map((a) => {
          const pct = percent(a.runsDone, a.runsTotal);
          const row = (
            <tr key={a.key} className={a.isYou ? "is-you" : undefined}>
              <td>
                <span className="compare-name">
                  <span
                    className="swatch"
                    style={{ background: seriesColour(a.slot) }}
                  />
                  {displayName(a)}
                </span>
              </td>
              <td>
                <strong>{pct}%</strong>
                <span className="muted small block">
                  {a.runsDone} of {a.runsTotal}
                </span>
              </td>
              {showStrength && (
                <td>
                  {a.strengthTotal > 0 ? (
                    <>
                      <strong>{percent(a.strengthDone, a.strengthTotal)}%</strong>
                      <span className="muted small block">
                        {a.strengthDone} of {a.strengthTotal}
                      </span>
                    </>
                  ) : (
                    <span className="muted">–</span>
                  )}
                </td>
              )}
              <td>
                <strong>{a.km.toFixed(1)} km</strong>
                <span className="muted small block">
                  {a.plannedToDateKm.toFixed(0)} km planned
                </span>
              </td>
            </tr>
          );
          return row;
        })}
      </tbody>
    </table>
  );
  return table;
}

// Line chart ---------------------------------------------------------------

interface ChartProps {
  dates: string[];
  today: string;
  athletes: CompareAthlete[];
  values: (athlete: CompareAthlete) => (number | null)[];
  format: (value: number) => string;
  tick: (value: number) => string; // y-axis label
  yMax?: number; // the axis reaches at least this, e.g. 100% or the plan's total km
  reference?: { value: number; label: string }; // a dashed line, e.g. the plan's total
  label: string;
  tableHeading: string;
}

/** SVG path through the non-null points, breaking the line at gaps. */
function linePath(
  values: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let path = "";
  let pen = "M";
  values.forEach((v, i) => {
    if (v === null) {
      pen = "M";
    } else {
      path += `${pen} ${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = "L";
    }
  });
  const trimmed = path.trim();
  return trimmed;
}

/** Index of the last non-null value, or -1. */
function lastIndex(values: (number | null)[]): number {
  let index = -1;
  values.forEach((v, i) => {
    if (v !== null) index = i;
  });
  return index;
}

/** Spreads label y positions apart so they don't overlap. */
function spreadLabels<T extends { y: number }>(labels: T[]): T[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < LABEL_GAP) {
      sorted[i] = { ...sorted[i], y: sorted[i - 1].y + LABEL_GAP };
    }
  }
  return sorted;
}

/** One line per athlete on a shared calendar, with a crosshair tooltip. */
function MultiLineChart(props: ChartProps) {
  const { dates, today, athletes, values, format } = props;
  const [hover, setHover] = useState<number | null>(null);
  const n = dates.length;
  const series = athletes.map((a) => ({ athlete: a, values: values(a) }));
  const maxValue = Math.max(
    ...series.flatMap((s) => s.values.map((v) => v ?? 0)),
    props.yMax ?? 0,
    1,
  );
  const { step, top } = niceAxis(maxValue);
  const reference = props.reference;
  const x = (i: number): number => xAt(i, n);
  const y = (v: number): number => CHART.top + PLOT_H - (v / top) * PLOT_H;
  const baseline = y(0);

  const yTicks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) yTicks.push(v);
  const xTicks = weekTicks(dates);
  const todayIndex = dates.indexOf(today);

  const ends = series
    .map((s) => ({ ...s, end: lastIndex(s.values) }))
    .filter((s) => s.end >= 0);
  const labels =
    ends.length <= LABEL_LIMIT
      ? spreadLabels(
          ends.map((s) => ({
            key: s.athlete.key,
            name: s.athlete.name,
            x: x(s.end),
            y: y(s.values[s.end] ?? 0) + 3.5,
          })),
        )
      : [];

  /** Snaps the crosshair to the nearest day under the pointer. */
  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    setHover(indexAt(event, n));
  };
  const hoveredRows =
    hover === null
      ? []
      : series
          .filter((s) => s.values[hover] !== null)
          .sort((a, b) => (b.values[hover] ?? 0) - (a.values[hover] ?? 0));
  const tipLeft = hover !== null ? (x(hover) / CHART.width) * 100 : 0;

  const chart = (
    <div className="chart">
      <ul className="legend">
        {athletes.map((a) => (
          <li key={a.key}>
            <span className="line-key" style={{ background: seriesColour(a.slot) }} />
            {displayName(a)}
          </li>
        ))}
      </ul>
      <div className="chart-frame">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label={props.label}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={CHART.left}
                x2={CHART.width - CHART.right}
                y1={y(v)}
                y2={y(v)}
                className="grid"
              />
              <text x={CHART.left - 6} y={y(v) + 3.5} className="tick" textAnchor="end">
                {props.tick(v)}
              </text>
            </g>
          ))}
          {reference && (
            <g>
              <line
                x1={CHART.left}
                x2={CHART.width - CHART.right}
                y1={y(reference.value)}
                y2={y(reference.value)}
                className="goal-line"
              />
              <text
                x={CHART.width - CHART.right}
                y={y(reference.value) - 4}
                className="tick"
                textAnchor="end"
              >
                {reference.label}
              </text>
            </g>
          )}
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
            <line
              x1={x(todayIndex)}
              x2={x(todayIndex)}
              y1={CHART.top}
              y2={baseline}
              className="today-line"
            />
          )}
          {series.map((s) => (
            <path
              key={s.athlete.key}
              d={linePath(s.values, x, y)}
              className="compare-line"
              style={{ stroke: seriesColour(s.athlete.slot) }}
            />
          ))}
          {ends.map((s) => (
            <circle
              key={s.athlete.key}
              cx={x(s.end)}
              cy={y(s.values[s.end] ?? 0)}
              r={4}
              className="compare-dot"
              style={{ fill: seriesColour(s.athlete.slot) }}
            />
          ))}
          {hover === null &&
            labels.map((l) => {
              const flip = l.x > CHART.width * 0.75;
              const text = (
                <text
                  key={l.key}
                  x={flip ? l.x - 8 : l.x + 8}
                  y={l.y}
                  className="line-label"
                  textAnchor={flip ? "end" : "start"}
                >
                  {l.name}
                </text>
              );
              return text;
            })}
          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={CHART.top}
                y2={baseline}
                className="crosshair"
              />
              {hoveredRows.map((s) => (
                <circle
                  key={s.athlete.key}
                  cx={x(hover)}
                  cy={y(s.values[hover] ?? 0)}
                  r={4}
                  className="compare-dot"
                  style={{ fill: seriesColour(s.athlete.slot) }}
                />
              ))}
            </g>
          )}
        </svg>
        {hover !== null && hoveredRows.length > 0 && (
          <div
            className="tooltip"
            style={{
              left: `${tipLeft}%`,
              transform: `translateX(${tipLeft > 60 ? "-105%" : "5%"})`,
            }}
          >
            <p className="tooltip-date">{formatShortDate(dates[hover])}</p>
            {hoveredRows.map((s) => (
              <p key={s.athlete.key}>
                <span
                  className="line-key"
                  style={{ background: seriesColour(s.athlete.slot) }}
                />
                <strong>{format(s.values[hover] ?? 0)}</strong> {s.athlete.name}
              </p>
            ))}
          </div>
        )}
      </div>
      {todayIndex >= 0 && (
        <p className="muted small chart-axis-note">Lines stop at today.</p>
      )}
      <CompareChartTable
        dates={dates}
        today={today}
        series={series}
        format={format}
        heading={props.tableHeading}
      />
    </div>
  );
  return chart;
}

/** Each athlete's figure at the end of each week, for reading without hovering. */
function CompareChartTable(props: {
  dates: string[];
  today: string;
  series: { athlete: CompareAthlete; values: (number | null)[] }[];
  format: (value: number) => string;
  heading: string;
}) {
  const rows = props.dates
    .map((date, i) => ({ date, i }))
    .filter(
      ({ date, i }) => (i % 7 === 6 && date <= props.today) || date === props.today,
    );
  const table = (
    <details className="chart-table">
      <summary>Show as a table</summary>
      <table>
        <caption className="visually-hidden">{props.heading} by week</caption>
        <thead>
          <tr>
            <th>Date</th>
            {props.series.map((s) => (
              <th key={s.athlete.key}>{s.athlete.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ date, i }) => (
            <tr key={date}>
              <td>{formatShortDate(date)}</td>
              {props.series.map((s) => {
                const v = s.values[i];
                const cell = (
                  <td key={s.athlete.key}>{v === null ? "–" : props.format(v)}</td>
                );
                return cell;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
  return table;
}
