export interface ApiError {
  error: string;
  message: string;
}

/** Shows a load error with a reconnect link or a retry button. */
export default function ErrorCard({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  const reconnect = error.error === "strava_reconnect" || error.error === "signed_out";
  const card = (
    <section className="card alert-card" role="alert">
      <p>{error.message}</p>
      {reconnect ? (
        <a className="strava-connect" href="/api/auth/login">
          Reconnect Strava
        </a>
      ) : (
        <button type="button" className="button-quiet" onClick={onRetry}>
          Try again
        </button>
      )}
    </section>
  );
  return card;
}
