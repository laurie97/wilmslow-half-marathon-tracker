"use client";

import { useEffect, useState } from "react";
import { dayName } from "@/lib/dates";
import { formatKm, formatShortDate } from "@/lib/format";
import { isRunSession } from "@/lib/matching";
import type { PlanSummary } from "@/lib/progress";
import type { Exercise, ManualStatus, SessionResult, WeekResult } from "@/lib/types";
import { STATUS_LABELS } from "./WeekView";

type Pick = "auto" | "none" | number[];

interface SheetProps {
  result: SessionResult;
  week: WeekResult;
  plan: PlanSummary;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS: { value: ManualStatus | null; label: string }[] = [
  { value: null, label: "Auto" },
  { value: "done", label: "Done" },
  { value: "partial", label: "Partial" },
  { value: "skipped", label: "Skipped" },
];

/** The run choice to start from, based on the saved override. */
function initialPick(result: SessionResult): Pick {
  const ids = result.override?.activityIds;
  const pick: Pick =
    ids === null || ids === undefined ? "auto" : ids.length ? ids : "none";
  return pick;
}

/** "3 × 10 per side" or "2 × 30 s" for one exercise. */
function exerciseLine(exercise: Exercise, sets: number | undefined): string {
  const amount = exercise.duration_s
    ? `${exercise.duration_s} s`
    : `${exercise.reps ?? ""}`;
  const perSide = exercise.per_side ? " per side" : "";
  const line = `${sets ? `${sets} × ` : ""}${amount}${perSide}`;
  return line;
}

/** Bottom sheet for correcting a session: status, which run, or a strength tick. */
export default function SessionSheet({
  result,
  week,
  plan,
  onClose,
  onSaved,
}: SheetProps) {
  const { session } = result;
  const isRun = isRunSession(session);
  const multi = session.type === "time_trial" || session.type === "race";
  const [status, setStatus] = useState<ManualStatus | null>(
    result.override?.status ?? null,
  );
  const [pick, setPick] = useState<Pick>(initialPick(result));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const cleanup = () => window.removeEventListener("keydown", onKey);
    return cleanup;
  }, [onClose]);

  /** Sends the override to the server, then closes the sheet. */
  async function save(nextStatus: ManualStatus | null, nextPick: Pick) {
    setSaving(true);
    setError(null);
    const activityIds =
      nextPick === "auto" ? null : nextPick === "none" ? [] : nextPick;
    try {
      const response = await fetch("/api/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          status: nextStatus,
          activityIds,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message ?? "Couldn't save.");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setSaving(false);
    }
  }

  /** Selects or deselects a run (several allowed for a time trial or race). */
  function toggleRun(id: number) {
    const current = Array.isArray(pick) ? pick : [];
    let next: number[];
    if (current.includes(id)) {
      next = current.filter((x) => x !== id);
    } else {
      next = multi ? [...current, id] : [id];
    }
    setPick(next.length > 0 ? next : "auto");
  }

  // Which session each of this week's runs is currently matched to.
  const usedBy = new Map<number, string>();
  week.sessions.forEach((r) =>
    r.matched.forEach((a) => usedBy.set(a.id, r.session.title)),
  );
  const pinnedHere = Array.isArray(pick) ? pick : [];
  const autoLabel =
    result.override?.activityIds == null && result.matched.length > 0
      ? `Auto (${result.matched.map((a) => dayName(a.date)).join(", ")})`
      : "Auto";

  const routine = session.routine ? plan.strengthRoutines[session.routine] : undefined;
  const ticked = result.override?.status === "done";

  const sheet = (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={session.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <div>
            <p className="eyebrow">
              {dayName(session.date, "long")} {formatShortDate(session.date)}
            </p>
            <h2>{session.title}</h2>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="muted small">
          Now:{" "}
          <span className={`chip chip-${result.status}`}>
            {STATUS_LABELS[result.status]}
          </span>
        </p>

        {isRun ? (
          <>
            <h3 className="sheet-label">Status</h3>
            <div className="segmented" role="radiogroup" aria-label="Status">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={status === option.value}
                  className={status === option.value ? "selected" : ""}
                  onClick={() => setStatus(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <h3 className="sheet-label">Which run was it?</h3>
            <div className="choices">
              <button
                type="button"
                className={`choice${pick === "auto" ? " selected" : ""}`}
                onClick={() => setPick("auto")}
              >
                {autoLabel}
              </button>
              <button
                type="button"
                className={`choice${pick === "none" ? " selected" : ""}`}
                onClick={() => setPick("none")}
              >
                No run
              </button>
              {week.runs.map((a) => {
                const owner = usedBy.get(a.id);
                const selected = pinnedHere.includes(a.id);
                const choice = (
                  <button
                    key={a.id}
                    type="button"
                    className={`choice${selected ? " selected" : ""}`}
                    onClick={() => toggleRun(a.id)}
                  >
                    <span>
                      <strong>{dayName(a.date)}</strong> {a.name} ·{" "}
                      <span className="nowrap">
                        {formatKm(Math.round(a.distanceKm * 10) / 10)}
                      </span>
                    </span>
                    {owner && owner !== session.title && (
                      <span className="choice-note">now: {owner}</span>
                    )}
                  </button>
                );
                return choice;
              })}
              {week.runs.length === 0 && (
                <p className="muted small">No runs on Strava this week yet.</p>
              )}
            </div>
            {multi && <p className="muted small">Pick several for a split parkrun.</p>}

            {error && <p className="alert">{error}</p>}
            <button
              type="button"
              className="button-primary"
              disabled={saving}
              onClick={() => save(status, pick)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`tick${ticked ? " tick-done" : ""}`}
              disabled={saving}
              onClick={() => save(ticked ? null : "done", "auto")}
            >
              <span className="tick-mark" aria-hidden="true">
                ✓
              </span>
              {ticked ? "Done — tap to undo" : "Tick as done"}
            </button>
            {result.override?.status !== "skipped" ? (
              <button
                type="button"
                className="link-button"
                disabled={saving}
                onClick={() => save("skipped", "auto")}
              >
                Mark as skipped
              </button>
            ) : (
              <button
                type="button"
                className="link-button"
                disabled={saving}
                onClick={() => save(null, "auto")}
              >
                Undo skip
              </button>
            )}
            {error && <p className="alert">{error}</p>}
            {routine && routine.exercises.length > 0 && (
              <>
                <h3 className="sheet-label">
                  {routine.name} routine{session.sets ? ` · ${session.sets} sets` : ""}
                </h3>
                <ul className="exercises">
                  {routine.exercises.map((exercise, i) => (
                    <li key={`${exercise.name}-${i}`}>
                      <div className="exercise-head">
                        <strong>{exercise.name}</strong>
                        <span>{exerciseLine(exercise, session.sets)}</span>
                      </div>
                      {exercise.cue && <p className="muted small">{exercise.cue}</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
  return sheet;
}
