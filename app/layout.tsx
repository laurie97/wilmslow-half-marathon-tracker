import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Space_Grotesk } from "next/font/google";
import { DEFAULT_THEME, THEME_KEY, THEMES } from "@/lib/theme";
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

// Runs before paint so a saved theme shows without a flash of the default.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(${JSON.stringify(THEMES)}.indexOf(t)>-1){document.documentElement.dataset.theme=t}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Wilmslow Half tracker",
  description: "Training tracker for the Wilmslow Half Marathon, matched to Strava.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15171a",
};

/** Root HTML shell. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fonts = `${bricolage.variable} ${space.variable}`;
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
