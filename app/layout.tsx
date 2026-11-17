import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wilmslow Half tracker",
  description: "Training tracker for the Wilmslow Half Marathon, matched to Strava.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f5f2",
};

/** Root HTML shell. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const layout = (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
  return layout;
}
