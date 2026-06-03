import type { Run } from "@veilleur/shared/run";
import { useEffect, useState } from "react";

import { subscribeRun } from "@/data/runs";

export interface RunState {
  run: Run | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Live-subscribe to `runs/{date}` for the supervision view (FR-D1). Owns the two-listener
 * lifecycle (`subscribeRun`): re-subscribes when `date` changes and tears down on unmount.
 * `run` is null until the run document arrives (or if it doesn't exist); `loading` clears on the
 * first emission or error. Pass `enabled: false` to hold off subscribing (and free the two
 * Firestore reads) on surfaces that only conditionally need the run — e.g. the Today reading view,
 * which only needs it to disable the trigger button in the no-article state.
 */
export function useRun(date: string, enabled = true): RunState {
  const [state, setState] = useState<RunState>({ run: null, loading: enabled, error: null });

  useEffect(() => {
    if (!enabled) {
      setState({ run: null, loading: false, error: null });
      return;
    }
    setState({ run: null, loading: true, error: null });
    const unsub = subscribeRun(
      date,
      (run) => setState({ run, loading: false, error: null }),
      (error) => setState({ run: null, loading: false, error }),
    );
    return unsub;
  }, [date, enabled]);

  return state;
}
