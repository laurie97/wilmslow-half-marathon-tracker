"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { daysBetween } from "@/lib/dates";
import type { ProgressResponse } from "@/lib/progress";
import type { SessionResult, WeekResult } from "@/lib/types";
import ErrorCard, { type ApiError } from "./ErrorCard";
import PlanMenu from "./PlanMenu";
import PoweredByStrava from "./PoweredByStrava";
import RaccoonLogo from "./RaccoonLogo";
import SessionSheet from "./SessionSheet";
import WeekView from "./WeekView";

/** Index of the week to open on: the current week, else the nearest one. */
function initialWeek(weeks: WeekResult[]): number {
  const current = weeks.findIndex((w) => w.state === "current");
  if (current >= 0) {
    return current;
  }
  const firstFuture = weeks.findIndex((w) => w.state === "future");
  const index = firstFuture === -1 ? weeks.length - 1 : Math.max(firstFuture, 0);
  return index;
}

/** CSS class for a season-strip square, from the week's state and completion. */
function squareClass(week: WeekResult): string {
  let colour = "future";
  if (week.state === "past") {
    colour = week.completion >= 0.8 ? "good" : week.completion >= 0.5 ? "ok" : "poor";
  } else if (week.state === "current") {
    colour = "current";
  }
  const className = `square square-${colour}`;
  return className;
}

/** The signed-in app: header, season strip, week view and session sheet. */
export default function Tracker() {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekIndex, setWeekIndex] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{
    result: SessionResult;
    week: WeekResult;
  } | null>(null);
  const opened = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/progress", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setError(body as ApiError);
      } else {
        const progress = body as ProgressResponse;
        setData(progress);
        setError(null);
        if (!opened.current && progress.weeks.length > 0) {
          setWeekIndex(initialWeek(progress.weeks));
          opened.current = true;
        }
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
    const loadingPage = <main className="page loading">Loading your plan…</main>;
    return loadingPage;
  }
  if (!data && error) {
    const errorPage = (
      <main className="page">
        <ErrorCard error={error} onRetry={load} />
        <PoweredByStrava />
      </main>
    );
    return errorPage;
  }
  if (!data) {
    return null;
  }

  const plan = data.plan;
  const weeks = data.weeks;
  const index = weekIndex ?? 0;
  const week = weeks[index];
  const daysToGo = plan?.raceDate ? daysBetween(data.today, plan.raceDate) : null;

  const page = (
    <main className="page">
      <header className="top">
        <div className="top-row">
          <div className="brand">
            <RaccoonLogo size={48} />
            <div>
              <p className="eyebrow">
                {data.athlete.firstname || "Signed in"}
                {data.demo && <span className="demo-tag">demo</span>}
              </p>
              <h1>{plan?.raceName ?? "Wilmslow Half Marathon"}</h1>
            </div>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="link-button">
              Log out
            </button>
          </form>
        </div>
        {plan && (
          <div className="stats">
            {daysToGo !== null && (
              <div>
                <strong>{daysToGo >= 0 ? daysToGo : 0}</strong>
                <span>{daysToGo === 1 ? "day to go" : "days to go"}</span>
              </div>
            )}
            {plan.goalTime && (
              <div>
                <strong>{plan.goalTime}</strong>
                <span>goal</span>
              </div>
            )}
            {week && (
              <div>
                <strong>
                  {week.week}/{weeks.length}
                </strong>
                <span>week</span>
              </div>
            )}
          </div>
        )}
      </header>

      {error && <ErrorCard error={error} onRetry={load} />}

      {plan && weeks.length > 0 && (
        <nav className="strip" aria-label="Season">
          {weeks.map((w, i) => (
            <button
              key={w.week}
              type="button"
              className={`${squareClass(w)}${i === index ? " square-selected" : ""}`}
              onClick={() => setWeekIndex(i)}
              aria-label={`Week ${w.week}`}
              title={`Week ${w.week}`}
            />
          ))}
        </nav>
      )}

      <div className="toolbar">
        <button
          type="button"
          className="button-quiet"
          onClick={load}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
        {plan && weeks.length > 0 && (
          <Link href="/progress" className="button-quiet toolbar-link">
            Progress
          </Link>
        )}
        <PlanMenu plan={plan} onUploaded={load} />
      </div>

      {!plan && (
        <section className="card empty">
          <h2>Upload your plan</h2>
          <p className="muted">
            Choose your plan JSON file from the Plan menu above. Your runs will be
            matched to it automatically.
          </p>
        </section>
      )}

      {week && plan && (
        <WeekView
          week={week}
          plan={plan}
          today={data.today}
          canBack={index > 0}
          canForward={index < weeks.length - 1}
          onBack={() => setWeekIndex(index - 1)}
          onForward={() => setWeekIndex(index + 1)}
          onOpen={(result) => setSheet({ result, week })}
        />
      )}

      {sheet && plan && (
        <SessionSheet
          result={sheet.result}
          week={sheet.week}
          plan={plan}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            load();
          }}
        />
      )}

      <PoweredByStrava />
    </main>
  );
  return page;
}
