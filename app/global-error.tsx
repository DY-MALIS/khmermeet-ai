"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="km">
      <body>
        <main
          style={{
            display: "grid",
            minHeight: "100vh",
            placeItems: "center",
            padding: 24,
            fontFamily: "system-ui, sans-serif"
          }}
        >
          <section style={{ maxWidth: 560, border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, textAlign: "center" }}>
            <p style={{ color: "#dc2626", fontWeight: 700, margin: 0 }}>Application error</p>
            <h1 style={{ margin: "8px 0 0", fontSize: 28 }}>Something went wrong loading the app</h1>
            <p style={{ color: "#475569", lineHeight: 1.7 }}>
              Click Try again. If the problem continues, check Runtime Logs in Vercel.
            </p>
            {error.digest ? <p style={{ color: "#94a3b8", fontSize: 12 }}>Digest: {error.digest}</p> : null}
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 10,
                background: "#18745f",
                color: "white",
                cursor: "pointer",
                fontWeight: 700,
                padding: "10px 16px"
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
