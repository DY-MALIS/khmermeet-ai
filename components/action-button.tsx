"use client";

import { useFormStatus } from "react-dom";

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
  return (
    <button className={className} disabled={pending || disabled} form={form}>
      {pending ? "កំពុងដំណើរការ..." : children}
    </button>
  );
}
