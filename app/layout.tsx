import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUMEN 85 — a lens built entirely from code",
  description:
    "No video files. No downloaded models. A live three.js lens, lit like a photo studio and directed by your scroll.",
};
export const viewport: Viewport = { themeColor: "#080808", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
