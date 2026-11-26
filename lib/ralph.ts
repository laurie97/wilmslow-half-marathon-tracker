// What Ralph, the app's raccoon mascot, says about your progress.
//
// Each mood has several lines. Ralph moves on to the next one every time a
// session (run or strength) is done, so he doesn't repeat himself all week.

import type { RunCounts, SessionCounts } from "./stats";

type Line = (ran: number, due: number) => string;

export const FIRST_RUN_LINES: string[] = [
  "Bib pinned, tail fluffed. Ralph is ready for your first run!",
];

export const ALL_DONE_LINES: string[] = [
  "Every single run done. Ralph is speechless (and a bit emotional).",
  "Every single run done. Ralph is having it framed.",
  "Every single run done. No excuses left — just go and smash Wilmslow.",
];

export const IMPRESSED_LINES: Line[] = [
  (ran, due) => `${ran} of ${due} runs done so far. Ralph is seriously impressed!`,
  (ran, due) =>
    `${ran} of ${due} runs done. Ralph has started telling the other raccoons about you.`,
  (ran, due) =>
    `${ran} of ${due}. Ralph didn't think you had it in you, if he's honest.`,
  (ran, due) => `${ran} of ${due} runs done. Annoyingly consistent. Ralph respects it.`,
  (ran, due) =>
    `${ran} of ${due}. Your Strava followers are sick of your kudos requests. Ralph isn't.`,
  (ran, due) =>
    `${ran} of ${due} runs done. Don't get smug — the cool-down still counts.`,
  (ran, due) =>
    `${ran} of ${due}. Ralph would buy you a pint, but he's a raccoon and has no money.`,
];

export const ON_TRACK_LINES: Line[] = [
  (ran, due) => `${ran} of ${due} runs done so far. Ralph reckons you're on track.`,
  (ran, due) => `${ran} of ${due}. Solid. Not legendary, but solid.`,
  (ran, due) =>
    `${ran} of ${due} runs done. Ralph has noticed the odd gap. He's not saying anything. He's just noticed.`,
  (ran, due) => `${ran} of ${due}. On track — just don't get cocky.`,
  (ran, due) =>
    `${ran} of ${due} runs done. Good, not great. The half marathon will know the difference.`,
  (ran, due) =>
    `${ran} of ${due}. Ralph saw you eyeing the sofa on a run day. He's watching.`,
];

export const BEHIND_LINES: Line[] = [
  (ran, due) =>
    `${ran} of ${due} runs done so far. Ralph says every run counts, so let's get the next one in.`,
  (ran, due) =>
    `${ran} of ${due}. Ralph has stopped asking how training's going. Prove him wrong.`,
  (ran, due) =>
    `${ran} of ${due} runs done. 21.1 km doesn't care about your excuses. Neither does Ralph.`,
  (ran, due) =>
    `${ran} of ${due}. Ralph has done more running than this, and he mostly sprints away from bin lorries.`,
  (ran, due) => `${ran} of ${due} runs done. Those trainers aren't decorative.`,
  (ran, due) =>
    `${ran} of ${due}. Ralph's not angry, just disappointed. Mostly disappointed.`,
  (ran, due) =>
    `${ran} of ${due} runs done. The start line is getting closer whether you run or not.`,
];

/** The line at `turn`, wrapping round to the start of the list. */
function cycle<T>(lines: T[], turn: number): T {
  const line = lines[((turn % lines.length) + lines.length) % lines.length];
  return line;
}

/**
 * A short line from Ralph, based on runs done so far. `strength` (if given)
 * counts towards which line he picks, so he changes after every session.
 */
export function ralphSays(runs: RunCounts, strength?: SessionCounts): string {
  const ran = runs.done + runs.partial;
  const turn = ran + (strength ? strength.done + strength.partial : 0);
  const share = runs.due > 0 ? ran / runs.due : 0;
  let message: string;
  if (runs.total > 0 && ran >= runs.total) {
    message = cycle(ALL_DONE_LINES, turn);
  } else if (runs.due === 0) {
    message = cycle(FIRST_RUN_LINES, turn);
  } else if (share >= 0.9) {
    message = cycle(IMPRESSED_LINES, turn)(ran, runs.due);
  } else if (share >= 0.7) {
    message = cycle(ON_TRACK_LINES, turn)(ran, runs.due);
  } else {
    message = cycle(BEHIND_LINES, turn)(ran, runs.due);
  }
  return message;
}
