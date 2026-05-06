"use client";

import { SessionProvider } from "next-auth/react";
import { AppTextTranslator } from "@/components/app-text-translator";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppTextTranslator />
      {children}
    </SessionProvider>
  );
}
