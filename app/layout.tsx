import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionKeeper } from "@/components/session-keeper";

export const metadata: Metadata = {
  title: "KhmerMeet AI",
  description: "AI meeting recorder and action tracker for Cambodian teams",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "KhmerMeet"
  }
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="km">
      <body>
        {/* Mounted at the root so it covers both the sign-in screen (where it
            restores a session whose cookies the browser dropped) and every
            signed-in page (where it keeps the backup copy current). */}
        <SessionKeeper />
        {children}
      </body>
    </html>
  );
}
