const LOOKS = [
  { theme: "bandit", label: "Bandit" },
  { theme: "midnight", label: "Midnight" },
  { theme: "raceday", label: "Race day" },
];

export default function PoweredByStrava() {
  const badge = (
    <footer className="powered">
      Powered by <strong>Strava</strong>
      <nav className="theme-picker" aria-label="Try a look">
        <span>Try a look:</span>
        {LOOKS.map((look) => (
          <a key={look.theme} href={`?theme=${look.theme}`}>
            {look.label}
          </a>
        ))}
      </nav>
    </footer>
  );
  return badge;
}
