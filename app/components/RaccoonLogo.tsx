/** The app's mascot: Ralph the raccoon, running in a race bib. Decorative, so no alt text. */
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
      alt=""
      width={size}
      height={size}
      className={`raccoon ${className}`.trim()}
    />
  );
  return logo;
}
