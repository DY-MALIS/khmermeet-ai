"use client";

import { useFormStatus } from "react-dom";

export function ActionButton({
  children,
  className = "kh-button-primary",
  form
}: {
  children: React.ReactNode;
  className?: string;
  form?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} form={form}>
      {pending ? "កំពុងដំណើរការ..." : children}
    </button>
  );
}
