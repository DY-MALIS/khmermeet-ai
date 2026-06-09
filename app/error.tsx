"use client";

import Link from "next/link";
import { useEffect } from "react";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="kh-card w-full max-w-xl p-6 text-center">
        <p className="text-sm font-semibold text-red-600">Application error</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">មានបញ្ហាក្នុងការបើកទំព័រ</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          សូមសាកល្បងម្តងទៀត។ ប្រសិនបើនៅតែមានបញ្ហា សូមពិនិត្យ Vercel Runtime Logs ឬបើក Dashboard ម្តងទៀត។
        </p>
        {error.digest ? <p className="mt-3 text-xs text-slate-400">Digest: {error.digest}</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="kh-button-primary" onClick={reset}>
            Try again
          </button>
          <Link className="kh-button-secondary" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
