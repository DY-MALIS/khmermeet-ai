"use client";

import { useFormStatus } from "react-dom";
import { useBilingualText } from "@/lib/display-language";

export function ActionButton({
  children,
  className = "kh-button-primary",
  form,
  disabled
}: {
  children: React.ReactNode;
  className?: string;
  form?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const t = useBilingualText();
  return (
    <button className={className} disabled={pending || disabled} form={form}>
      {pending ? t("កំពុងដំណើរការ...", "Working...") : children}
    </button>
  );
}
