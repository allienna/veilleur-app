import { useEffect, useState } from "react";

/**
 * A 1-second clock, ticking only while `active` (F-011 AD-3). Drives the live elapsed duration of
 * the running step — Firestore only re-renders on writes, so without a local tick the duration
 * would freeze between step transitions. Returns `Date.now()`; when inactive it returns a stable
 * value and registers no interval. This is a text value, not motion, so it is intentionally
 * unaffected by `prefers-reduced-motion`.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  return now;
}
