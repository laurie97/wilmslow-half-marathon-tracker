"use client";

import { addDays, dayName } from "@/lib/dates";
import { formatKm, formatMinutes, formatShortDate } from "@/lib/format";
import type { PlanSummary } from "@/lib/progress";
import type { SessionResult, SessionStatus, WeekResult } from "@/lib/types";
import RunRow from "./RunRow";

export const STATUS_LABELS: Record<SessionStatus, string> = {
  done: "Done",
  partial: "Partial",
  missed: "Missed",
  skipped: "Skipped",
  planned: "Upcoming",
};

const WARM_UP_TYPES = new Set(["intervals", "tempo"]);

interface WeekViewProps {
  week: WeekResult;
  plan: PlanSummary;
  today: string;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onOpen: (result: SessionResult) => void;
}

/** One week: navigation, phase and km summary, Mon–Sun days and extra runs. */
export default function WeekView(props: WeekViewProps) {
  const { week, plan, today } = props;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.weekCommencing, i));
  const planned = week.plannedKm;
  const share = planned ? Math.min(week.actualKm / planned, 1) : 0;

  const view = (
    <section className="week">
      <div className="week-nav">
        <button
          type="button"
          className="nav-arrow"
          onClick={props.onBack}
          disabled={!props.canBack}
          aria-label="Previous week"
        >
          ‹
        </button>
        <div className="week-title">
          <h2>Week {week.week}</h2>
          <p className="muted">
            {formatShortDate(week.weekCommencing)} – {formatShortDate(week.weekEnding)}
          </p>
        </div>
        <button
          type="button"
          className="nav-arrow"
          onClick={props.onForward}
          disabled={!props.canForward}
          aria-label="Next week"
        >
          ›
        </button>
      </div>

      <div className="card week-summary">
        <p className="phase">{week.phaseName}</p>
        {week.notes && <p className="week-notes">{week.notes}</p>}
        <div className="km">
          <div className="km-bar" aria-hidden="true">
            <div className="km-fill" style={{ width: `${share * 100}%` }} />
          </div>
          <p className="km-text">
            <strong>{week.actualKm.toFixed(1)}</strong>
            {planned ? ` of ${planned} km planned` : " km"}
          </p>
        </div>
      </div>

      <ol className="days">
        {days.map((date) => {
          const sessions = week.sessions.filter((s) => s.session.date === date);
          const isToday = date === today;
          const day = (
            <li key={date} className={`day${isToday ? " day-today" : ""}`}>
              <div className="day-label">
                <span className="day-name">{dayName(date)}</span>
                <span className="day-date">{Number(date.slice(8))}</span>
                {isToday && <span className="today-tag">Today</span>}
              </div>
              <div className="day-sessions">
                {sessions.length === 0 ? (
                  <p className="rest">Rest</p>
                ) : (
                  sessions.map((result) => (
                    <SessionCard
                      key={result.session.id}
                      result={result}
                      plan={plan}
                      onOpen={() => props.onOpen(result)}
                    />
                  ))
                )}
              </div>
            </li>
          );
          return day;
        })}
      </ol>

      {week.extras.length > 0 && (
        <section className="extras">
          <h3>Other runs this week</h3>
          <div className="card">
            {week.extras.map((a) => (
              <RunRow key={a.id} activity={a} showDay />
            ))}
          </div>
        </section>
      )}
    </section>
  );
  return view;
}

/** A planned session with its status, details and matched runs. */
function SessionCard({
  result,
  plan,
  onOpen,
}: {
  result: SessionResult;
  plan: PlanSummary;
  onOpen: () => void;
}) {
  const { session, status, matched } = result;
  const meta: string[] = [];
  if (session.est_distance_km) meta.push(formatKm(session.est_distance_km));
  if (session.est_duration_min) meta.push(formatMinutes(session.est_duration_min));
  if (session.goal_time) meta.push(`goal ${session.goal_time}`);
  const showWarmUp = WARM_UP_TYPES.has(session.type);
  const warmUp = showWarmUp && plan.warmUp?.appliesTo.includes(session.type);
  const coolDown = showWarmUp && plan.coolDown?.appliesTo.includes(session.type);
  const movedTo = result.moved && matched[0] ? dayName(matched[0].date) : null;

  const card = (
    <article className={`session status-${status}`}>
      <button type="button" className="session-main" onClick={onOpen}>
        <div className="session-head">
          <h3>{session.title}</h3>
          <span className={`chip chip-${status}`}>{STATUS_LABELS[status]}</span>
        </div>
        {meta.length > 0 && <p className="session-meta">{meta.join(" · ")}</p>}
        {(movedTo || result.isManual) && (
          <p className="tags">
            {movedTo && <span className="tag">moved to {movedTo}</span>}
            {result.isManual && <span className="tag">set by hand</span>}
          </p>
        )}
        {session.notes && <p className="session-notes">{session.notes}</p>}
        {warmUp && (
          <p className="session-extra">
            <strong>
              Warm-up{session.warm_up_km ? ` (${formatKm(session.warm_up_km)})` : ""}:
            </strong>{" "}
            {plan.warmUp?.description}
          </p>
        )}
        {coolDown && (
          <p className="session-extra">
            <strong>
              Cool-down
              {session.cool_down_km ? ` (${formatKm(session.cool_down_km)})` : ""}:
            </strong>{" "}
            {plan.coolDown?.description}
          </p>
        )}
      </button>
      {matched.length > 0 && (
        <div className="session-runs">
          {matched.map((a) => (
            <RunRow key={a.id} activity={a} showDay={a.date !== session.date} />
          ))}
        </div>
      )}
    </article>
  );
  return card;
}
