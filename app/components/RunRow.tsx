import { dayName } from "@/lib/dates";
import { formatKm, formatPace, stravaUrl } from "@/lib/format";
import type { Activity } from "@/lib/types";

/** One Strava run: name, distance, pace, heart rate and a View on Strava link. */
export default function RunRow({
  activity,
  showDay = false,
}: {
  activity: Activity;
  showDay?: boolean;
}) {
  const details = [
    formatKm(Math.round(activity.distanceKm * 10) / 10),
    formatPace(activity.movingTimeS, activity.distanceKm),
  ];
  if (activity.avgHr) details.push(`${activity.avgHr} bpm`);
  const row = (
    <div className="run">
      <div className="run-text">
        <p className="run-name">
          {showDay && <span className="run-day">{dayName(activity.date)}</span>}
          {activity.name}
        </p>
        <p className="run-details">{details.join(" · ")}</p>
      </div>
      <a
        className="view-on-strava"
        href={stravaUrl(activity.id)}
        target="_blank"
        rel="noopener noreferrer"
      >
        View on Strava
      </a>
    </div>
  );
  return row;
}
