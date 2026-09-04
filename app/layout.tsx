import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KhmerMeet AI",
  description: "AI meeting recorder and action tracker for Cambodian teams"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="km">
      <body>{children}</body>
    </html>
  );
}
