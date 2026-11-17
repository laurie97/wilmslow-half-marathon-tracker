// What Ralph, the app's raccoon mascot, says about your progress.

import type { RunCounts } from "./stats";

/** A short line of encouragement from Ralph, based on runs done so far. */
export function ralphSays(runs: RunCounts): string {
  const ran = runs.done + runs.partial;
  const share = runs.due > 0 ? ran / runs.due : 0;
  let message: string;
  if (runs.total > 0 && ran >= runs.total) {
    message = "Every single run done. Ralph is speechless (and a bit emotional).";
  } else if (runs.due === 0) {
    message = "Shoes laced, bib pinned. Ralph is ready for your first run!";
  } else if (share >= 0.9) {
    message = `${ran} of ${runs.due} runs done so far. Ralph is seriously impressed!`;
  } else if (share >= 0.7) {
    message = `${ran} of ${runs.due} runs done so far. Ralph reckons you're on track.`;
  } else {
    message = `${ran} of ${runs.due} runs done so far. Ralph says every run counts, so let's get the next one in.`;
  }
  return message;
}
