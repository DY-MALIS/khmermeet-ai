"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const BACKUP_KEY = "khmermeet-session-backup";

// The Supabase session lives in cookies so the server can read it. Chrome
// drops those cookies in situations the app cannot control - the browser not
// shutting down cleanly, or a "clear site data on close" setting - and the
// person is then asked to connect their Google account again even though
// their session on Supabase is still perfectly valid for days.
//
// So keep a second copy of the tokens in localStorage and put the session
// back together from it when the cookies are gone. Signing out clears the
// copy, so "stay signed in until I sign out" still means exactly that.
type Backup = { access_token: string; refresh_token: string };

function readBackup(): Backup | null {
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Backup>;
    if (!parsed.access_token || !parsed.refresh_token) return null;
    return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
  } catch {
    return null;
  }
}

function writeBackup(backup: Backup) {
  try {
    window.localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  } catch {
    // Private mode or storage disabled - cookies alone still work.
  }
}

function clearBackup() {
  try {
    window.localStorage.removeItem(BACKUP_KEY);
  } catch {
    // Nothing to do.
  }
}

// Sign-out must clear the backup or the restore below would immediately put
// the person back in and there would be no way to leave the account. Called
// directly by the sign-out button rather than relying only on the SIGNED_OUT
// event, which can lose the race against the redirect that follows it.
export function clearSessionBackup() {
  clearBackup();
}

export function SessionKeeper() {
  // A failed restore must not retry in a loop: the tokens are gone for good
  // in that case and the person needs to sign in again.
  const restoreAttempted = useRef(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        if (event === "SIGNED_OUT") clearBackup();
        return;
      }
      if (session.access_token && session.refresh_token) {
        writeBackup({ access_token: session.access_token, refresh_token: session.refresh_token });
      }
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.refresh_token) {
        writeBackup({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });
        return;
      }

      if (restoreAttempted.current) return;
      restoreAttempted.current = true;

      const backup = readBackup();
      if (!backup) return;

      // setSession revalidates the refresh token with Supabase and, on
      // success, writes the cookies back so the server sees the session too.
      const { data: restored, error } = await supabase.auth.setSession(backup);
      if (error || !restored.session) {
        clearBackup();
        return;
      }

      // Only the sign-in screen needs sending onward; anywhere else the page
      // is already where the person wanted to be and a reload is enough for
      // the server to see the restored cookies.
      window.location.replace(window.location.pathname.startsWith("/login") ? "/dashboard" : window.location.href);
    })();

    return () => subscription.subscription.unsubscribe();
  }, []);

  return null;
}
