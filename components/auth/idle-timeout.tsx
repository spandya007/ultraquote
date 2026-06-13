"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// App-side inactivity auto-logout. Mounted on authenticated layouts only.
// Cross-tab via a shared localStorage timestamp: activity in any tab keeps all
// alive; an idle logout in one tab signs out the others. (Supabase's own
// server-side session timeouts are Pro-only — pair with these when on Pro.)
const IDLE_LIMIT_MS = 30 * 60 * 1000;   // 30 min total
const WARN_MS = 2 * 60 * 1000;          // warn for the final 2 min
const WRITE_THROTTLE_MS = 5000;
const KEY = "ultraquote.lastActivity";
const LOGOUT_KEY = "ultraquote.idleLogout";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

export function IdleTimeout() {
  const [warnLeft, setWarnLeft] = useState<number | null>(null); // seconds left, or null = no warning
  const warningRef = useRef(false);
  const lastWriteRef = useRef(0);

  function recordActivity(force = false) {
    const t = Date.now();
    if (!force && t - lastWriteRef.current < WRITE_THROTTLE_MS) return;
    lastWriteRef.current = t;
    try { localStorage.setItem(KEY, String(t)); } catch {}
  }

  async function logout() {
    try { localStorage.setItem(LOGOUT_KEY, String(Date.now())); } catch {}
    try { await createClient().auth.signOut(); } catch {}
    window.location.href = "/login?reason=idle";
  }

  useEffect(() => {
    recordActivity(true);

    // Passive activity keeps the session alive — but is ignored while the
    // warning is up, so the modal stays put and its buttons are clickable.
    const onActivity = () => { if (!warningRef.current) recordActivity(); };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    // Another tab logging out → follow it to /login.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOGOUT_KEY) window.location.href = "/login?reason=idle";
    };
    window.addEventListener("storage", onStorage);

    const interval = setInterval(() => {
      const stored = Number(localStorage.getItem(KEY));
      const last = Number.isFinite(stored) && stored > 0 ? stored : Date.now();
      const elapsed = Date.now() - last;

      if (elapsed >= IDLE_LIMIT_MS) {
        clearInterval(interval);
        logout();
      } else if (elapsed >= IDLE_LIMIT_MS - WARN_MS) {
        warningRef.current = true;
        setWarnLeft(Math.ceil((IDLE_LIMIT_MS - elapsed) / 1000));
      } else if (warningRef.current) {
        // Reset (e.g. activity in another tab) — dismiss the warning.
        warningRef.current = false;
        setWarnLeft(null);
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stay() {
    warningRef.current = false;
    setWarnLeft(null);
    recordActivity(true);
  }

  if (warnLeft == null) return null;
  const m = Math.floor(warnLeft / 60);
  const s = warnLeft % 60;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-xl border shadow-2xl w-full max-w-sm p-5 text-center">
        <h3 className="font-semibold text-lg">Still there?</h3>
        <p className="text-sm text-muted-foreground mt-2">
          You’ll be signed out in{" "}
          <span className="font-mono font-medium text-foreground">{m}:{String(s).padStart(2, "0")}</span>{" "}
          due to inactivity.
        </p>
        <div className="flex justify-center gap-2 mt-5">
          <button onClick={() => logout()} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
            Sign out now
          </button>
          <button onClick={stay} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
