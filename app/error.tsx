"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useBilingualText } from "@/lib/display-language";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  const t = useBilingualText();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="kh-card w-full max-w-xl p-6 text-center">
        <p className="text-sm font-semibold text-red-600">{t("កម្មវិធីមានបញ្ហា", "Application error")}</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">{t("មិនអាចផ្ទុកទំព័រនេះបាន", "Something went wrong loading this page")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t("សូមសាកម្ដងទៀត។ បើបញ្ហានៅតែមាន សូមត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង។", "Please try again. If the problem continues, check Vercel Runtime Logs or return to the dashboard.")}
        </p>
        {error.digest ? <p className="mt-3 text-xs text-slate-400">{t("លេខកូដបញ្ហា", "Digest")}: {error.digest}</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="kh-button-primary" onClick={reset}>
            {t("សាកម្ដងទៀត", "Try again")}
          </button>
          <Link className="kh-button-secondary" href="/dashboard">
            {t("ត្រឡប់ទៅផ្ទាំងគ្រប់គ្រង", "Back to dashboard")}
          </Link>
        </div>
      </section>
    </main>
  );
}
