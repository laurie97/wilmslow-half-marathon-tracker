// Display helpers shared by the UI.

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "5:32 /km" from moving time and distance. */
export function formatPace(movingTimeS: number, distanceKm: number): string {
  if (distanceKm <= 0) {
    return "–";
  }
  const perKm = Math.round(movingTimeS / distanceKm);
  const pace = `${Math.floor(perKm / 60)}:${String(perKm % 60).padStart(2, "0")} /km`;
  return pace;
}

export function formatKm(km: number): string {
  const text = `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  return text;
}

/** "45 min" or "1 h 05". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    const early = `${minutes} min`;
    return early;
  }
  const text = `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  return text;
}

/** "30 Nov" from YYYY-MM-DD. */
export function formatShortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  const text = `${d} ${MONTHS[m - 1]}`;
  return text;
}

export function stravaUrl(activityId: number): string {
  const url = `https://www.strava.com/activities/${activityId}`;
  return url;
}
