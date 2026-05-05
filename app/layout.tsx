import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "KhmerMeet AI",
  description: "AI meeting recorder and action tracker for Cambodian teams"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="km">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
