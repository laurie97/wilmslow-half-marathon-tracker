// Shared layout and helpers for the progress page's line charts.

export const CHART = {
  width: 340,
  height: 200,
  left: 34,
  right: 12,
  top: 12,
  bottom: 24,
};
export const PLOT_W = CHART.width - CHART.left - CHART.right;
export const PLOT_H = CHART.height - CHART.top - CHART.bottom;

/** A clean axis step giving roughly four ticks up to `max`. */
export function niceStep(max: number): number {
  const raw = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return step;
}

/**
 * A clean axis from 0 to just above `max`: the step (1, 2, 2.5 or 5 times a
 * power of ten) giving 3 to 6 ticks with the lowest top, the larger step on a tie.
 */
export function niceAxis(max: number): { step: number; top: number } {
  const value = Math.max(max, 1);
  const fallback = niceStep(value);
  let best = { step: fallback, top: Math.ceil(value / fallback) * fallback };
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const scale of [magnitude / 10, magnitude]) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * scale;
      const count = Math.ceil(value / step - 1e-9);
      const top = Math.round(count * step * 1e6) / 1e6;
      const fits = count >= 3 && count <= 6;
      if (fits && (top < best.top || (top === best.top && step > best.step))) {
        best = { step, top };
      }
    }
  }
  return best;
}

/** x position of the i-th of n daily points. */
export function xAt(i: number, n: number): number {
  const x = CHART.left + (n > 1 ? (i / (n - 1)) * PLOT_W : 0);
  return x;
}

/** About five week-start labels along the x axis. */
export function weekTicks(dates: string[]): { date: string; i: number }[] {
  const weekStarts = dates
    .map((date, i) => ({ date, i }))
    .filter((_, i) => i % 7 === 0);
  const every = Math.max(1, Math.ceil(weekStarts.length / 5));
  const ticks = weekStarts.filter((_, k) => k % every === 0);
  return ticks;
}

/** The index of the daily point nearest the pointer, for the crosshair. */
export function indexAt(event: React.PointerEvent<SVGSVGElement>, n: number): number {
  const box = event.currentTarget.getBoundingClientRect();
  const svgX = ((event.clientX - box.left) / box.width) * CHART.width;
  const index = Math.round(((svgX - CHART.left) / PLOT_W) * (n - 1));
  const clamped = Math.min(n - 1, Math.max(0, index));
  return clamped;
}
