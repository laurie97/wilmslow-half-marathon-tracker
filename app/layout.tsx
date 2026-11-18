import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Bricolage_Grotesque, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Display fonts, one per theme. Exposed as CSS variables for globals.css.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
});
const space = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space",
});
const barlow = Barlow_Condensed({
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
});

const THEMES = ["bandit", "midnight", "raceday"] as const;
const DEFAULT_THEME = "bandit";

// Runs before paint: ?theme=<name> picks a theme and remembers it.
const THEME_SCRIPT = `(function(){try{var ok=${JSON.stringify(THEMES)};var t=new URLSearchParams(location.search).get("theme");if(ok.indexOf(t)>-1){localStorage.setItem("theme",t)}else{t=localStorage.getItem("theme")}if(ok.indexOf(t)>-1){document.documentElement.dataset.theme=t}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Wilmslow Half tracker",
  description: "Training tracker for the Wilmslow Half Marathon, matched to Strava.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f2b29",
};

/** Root HTML shell. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fonts = `${bricolage.variable} ${space.variable} ${barlow.variable}`;
  const layout = (
    <html
      lang="en-GB"
      data-theme={DEFAULT_THEME}
      className={fonts}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
  return layout;
}
