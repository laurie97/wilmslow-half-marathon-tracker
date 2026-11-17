"use client";

import { useState } from "react";
import {
  formatGap,
  formatKm,
  formatPace,
  formatRaceTime,
  formatShortDate,
  stravaUrl,
} from "@/lib/format";
import {
  ENDURANCE_FULL_KM,
  type Prediction,
  type PredictionPoint,
} from "@/lib/prediction";
import { HALF_MARATHON_KM } from "@/lib/stats";
import { CHART, PLOT_H, indexAt, weekTicks, xAt } from "./chart";

const MINUTE_STEPS = [1, 2, 5, 10, 15, 30, 60];

interface Props {
  current: Prediction | null; // today's prediction
  points: PredictionPoint[]; // one per day of the plan
  today: string;
  goalS: number | null;
  goalLabel: string | null;
}

/** Predicted half marathon time if you raced today, and how it has moved. */
export default function PredictionCard({
  current,
  points,
  today,
  goalS,
  goalLabel,
}: Props) {
  const hasHistory = points.some((p) => p.prediction !== null);
  const card = (
    <section className="card panel">
      <h2>Race prediction</h2>
      {current ? (
        <PredictionSummary prediction={current} goalS={goalS} goalLabel={goalLabel} />
      ) : (
        <p className="muted small prediction-empty">
          Run at least 3 km to get a prediction.
        </p>
      )}
      {hasHistory && <PredictionChart points={points} today={today} goalS={goalS} />}
      <p className="muted small chart-note">
        An estimate, not a Strava figure: your fastest run of 3 km or more in the last 8
        weeks, scaled to {HALF_MARATHON_KM.toFixed(1)} km with Riegel’s formula, plus an
        allowance for endurance until your longest run reaches {ENDURANCE_FULL_KM} km.
      </p>
    </section>
  );
  return card;
}

/** "3:12 slower than your 1:35:00 goal", or null without a goal. */
function goalGap(timeS: number, goalS: number | null, goalLabel: string | null) {
  if (goalS === null) {
    const none = null;
    return none;
  }
  const diff = Math.round(timeS - goalS);
  const label = goalLabel ?? formatRaceTime(goalS);
  const text =
    diff === 0
      ? `Right on your ${label} goal`
      : `${formatGap(diff)} ${diff > 0 ? "slower" : "faster"} than your ${label} goal`;
  return text;
}

/** The headline time, the gap to the goal and the run it comes from. */
function PredictionSummary({
  prediction,
  goalS,
  goalLabel,
}: {
  prediction: Prediction;
  goalS: number | null;
  goalLabel: string | null;
}) {
  const basis = prediction.basis;
  const gap = goalGap(prediction.timeS, goalS, goalLabel);
  const pace = formatPace(prediction.timeS, HALF_MARATHON_KM);
  const endurance = Math.round(prediction.enduranceS);
  const summary = (
    <div className="prediction-summary">
      <p>
        <strong className="figure">{formatRaceTime(prediction.timeS)}</strong> if you
        raced today
      </p>
      <p className="muted small">
        {gap ? `${gap} · ` : ""}
        <span className="nowrap">{pace}</span>
      </p>
      <p className="small prediction-basis">
        Based on <strong>{basis.name}</strong>, {formatShortDate(basis.date)}:{" "}
        {formatKm(Math.round(basis.distanceKm * 10) / 10)} in{" "}
        {formatRaceTime(basis.movingTimeS)}.{" "}
        <a
          className="view-on-strava"
          href={stravaUrl(basis.id)}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on Strava
        </a>
      </p>
      <p className="muted small">
        Longest run in the last 8 weeks:{" "}
        {formatKm(Math.round(prediction.longestKm * 10) / 10)}
        {endurance > 0
          ? `. Until it reaches ${ENDURANCE_FULL_KM} km, ${formatGap(endurance)} is added for endurance.`
          : ", so nothing is added for endurance."}
      </p>
    </div>
  );
  return summary;
}

/** "1:40" from seconds, for the y axis. */
function hoursMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const text = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  return text;
}

/** SVG path through the points with a prediction, broken where there is none. */
function linePath(
  points: PredictionPoint[],
  x: (i: number) => number,
  y: (s: number) => number,
): string {
  let path = "";
  let drawing = false;
  points.forEach((p, i) => {
    if (p.prediction) {
      path += `${drawing ? "L" : "M"} ${x(i).toFixed(1)} ${y(p.prediction.timeS).toFixed(1)} `;
      drawing = true;
    } else {
      drawing = false;
    }
  });
  const trimmed = path.trim();
  return trimmed;
}

/** Predicted time for each day so far, faster higher up, against the goal. */
function PredictionChart({
  points,
  today,
  goalS,
}: {
  points: PredictionPoint[];
  today: string;
  goalS: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length;
  const times = points
    .map((p) => p.prediction?.timeS)
    .filter((t): t is number => t !== undefined);
  const values = goalS !== null ? [...times, goalS] : times;
  const rawLo = Math.min(...values) - 60;
  const rawHi = Math.max(...values) + 60;
  const stepMin =
    MINUTE_STEPS.find((m) => m * 60 * 4 >= rawHi - rawLo) ??
    MINUTE_STEPS[MINUTE_STEPS.length - 1];
  const step = stepMin * 60;
  const lo = Math.floor(rawLo / step) * step;
  const hi = Math.ceil(rawHi / step) * step;
  const x = (i: number): number => xAt(i, n);
  // Faster (smaller) times sit higher up.
  const y = (s: number): number => CHART.top + ((s - lo) / (hi - lo)) * PLOT_H;
  const baseline = CHART.top + PLOT_H;

  const yTicks: number[] = [];
  for (let s = lo; s <= hi + 1e-9; s += step) yTicks.push(s);
  const xTicks = weekTicks(points.map((p) => p.date));
  const todayIndex = points.findIndex((p) => p.date === today);
  const path = linePath(points, x, y);
  const lastIndex = points.reduce((last, p, i) => (p.prediction ? i : last), -1);
  const last = lastIndex >= 0 ? points[lastIndex].prediction : null;

  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    setHover(indexAt(event, n));
  };
  const hovered = hover !== null ? points[hover] : null;
  const tipLeft = hover !== null ? (x(hover) / CHART.width) * 100 : 0;
  const label = last
    ? `Predicted half marathon time over the plan, now ${formatRaceTime(last.timeS)}${goalS !== null ? ` against a goal of ${formatRaceTime(goalS)}` : ""}.`
    : "Predicted half marathon time over the plan.";

  const chart = (
    <div className="chart prediction-chart">
      <ul className="legend">
        <li>
          <span className="line-key line-actual" />
          Prediction
        </li>
        {goalS !== null && (
          <li>
            <span className="line-key line-goal" />
            Goal
          </li>
        )}
      </ul>
      <div className="chart-frame">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label={label}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((s) => (
            <g key={s}>
              <line
                x1={CHART.left}
                x2={CHART.width - CHART.right}
                y1={y(s)}
                y2={y(s)}
                className="grid"
              />
              <text x={CHART.left - 6} y={y(s) + 3.5} className="tick" textAnchor="end">
                {hoursMinutes(s)}
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
                y={baseline - 4}
                className="tick"
                textAnchor={todayIndex > n * 0.8 ? "end" : "start"}
              >
                Today
              </text>
            </g>
          )}
          {goalS !== null && (
            <g>
              <line
                x1={CHART.left}
                x2={CHART.width - CHART.right}
                y1={y(goalS)}
                y2={y(goalS)}
                className="goal-line"
              />
              <text
                x={CHART.width - CHART.right}
                y={y(goalS) - 4}
                className="tick"
                textAnchor="end"
              >
                Goal {formatRaceTime(goalS)}
              </text>
            </g>
          )}
          {path && <path d={path} className="line-actual-path" />}
          {last && (
            <circle cx={x(lastIndex)} cy={y(last.timeS)} r={4.5} className="end-dot" />
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
              {hovered.prediction && (
                <circle
                  cx={x(hover)}
                  cy={y(hovered.prediction.timeS)}
                  r={4}
                  className="end-dot"
                />
              )}
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
            {hovered.prediction ? (
              <>
                <p>
                  <span className="line-key line-actual" />
                  <strong>{formatRaceTime(hovered.prediction.timeS)}</strong> predicted
                </p>
                <p className="muted">
                  from {hovered.prediction.basis.name} (
                  {formatShortDate(hovered.prediction.basis.date)})
                </p>
              </>
            ) : (
              <p className="muted">
                {hovered.date > today ? "Not run yet" : "No prediction"}
              </p>
            )}
            {goalS !== null && (
              <p>
                <span className="line-key line-goal" />
                <strong>{formatRaceTime(goalS)}</strong> goal
              </p>
            )}
          </div>
        )}
      </div>
      <p className="muted small chart-axis-note">Higher on the chart is faster.</p>
      <PredictionTable points={points} />
    </div>
  );
  return chart;
}

/** The predicted time at the end of each week, for reading without hovering. */
function PredictionTable({ points }: { points: PredictionPoint[] }) {
  const weekEnds = points.filter((_, i) => i % 7 === 6);
  const table = (
    <details className="chart-table">
      <summary>Show as a table</summary>
      <table>
        <thead>
          <tr>
            <th>Week ending</th>
            <th>Predicted</th>
            <th>Based on</th>
          </tr>
        </thead>
        <tbody>
          {weekEnds.map((p) => (
            <tr key={p.date}>
              <td>{formatShortDate(p.date)}</td>
              <td>{p.prediction ? formatRaceTime(p.prediction.timeS) : "–"}</td>
              <td>{p.prediction ? p.prediction.basis.name : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
  return table;
}
