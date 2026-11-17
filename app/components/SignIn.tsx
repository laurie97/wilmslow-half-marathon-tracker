import PoweredByStrava from "./PoweredByStrava";
import RaccoonLogo from "./RaccoonLogo";

const ERRORS: Record<string, string> = {
  denied: "Strava access wasn't granted. Please try again.",
  state: "The sign-in link expired. Please try again.",
  scope:
    "The tracker needs to read your activities. Please connect again and leave the activity boxes ticked.",
  strava: "Couldn't reach Strava. Please try again in a moment.",
  not_allowed: "This Strava account isn't set up for this tracker.",
};

/** Sign-in screen with the Connect with Strava button. */
export default function SignIn({
  error,
  demo,
}: {
  error: string | null;
  demo: boolean;
}) {
  const message = error ? (ERRORS[error] ?? "Sign-in failed. Please try again.") : null;
  const page = (
    <main className="signin">
      <div className="signin-card">
        <RaccoonLogo size={112} className="signin-logo" />
        <p className="eyebrow">Training tracker</p>
        <h1>Wilmslow Half Marathon</h1>
        <p className="muted">
          Sign in with Strava to see your plan, with your runs matched to each session.
        </p>
        {message && <p className="alert">{message}</p>}
        {/* Plain link: this starts a full-page redirect to Strava. */}
        <a className="strava-connect" href="/api/auth/login">
          {demo ? "Enter demo" : "Connect with Strava"}
        </a>
        {!demo && (
          <p className="small muted">
            Tick &ldquo;View data about your private activities&rdquo; so private runs
            are matched too.
          </p>
        )}
      </div>
      <PoweredByStrava />
    </main>
  );
  return page;
}
