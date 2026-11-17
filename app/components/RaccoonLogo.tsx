/** Ralph, the app's raccoon mascot, running in his race bib. */
export default function RaccoonLogo({
  size,
  className = "",
}: {
  size: number;
  className?: string;
}) {
  const logo = (
    <img
      src="/raccoon.svg"
      alt="Ralph the raccoon"
      title="Ralph"
      width={size}
      height={size}
      className={`raccoon ${className}`.trim()}
    />
  );
  return logo;
}
