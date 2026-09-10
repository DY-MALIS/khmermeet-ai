import type { Metadata } from "next";
import "./globals.css";
import { SessionKeeper } from "@/components/session-keeper";

export const metadata: Metadata = {
  title: "KhmerMeet AI",
  description: "AI meeting recorder and action tracker for Cambodian teams"
};

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
