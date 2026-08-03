import { useEffect, useState } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; data: T };

/** Run an async loader on mount / when `deps` change, tracking loading/error/ready. Pass
 * `enabled: false` (mirrors `useRun`) to skip calling `load` entirely — e.g. when a required
 * param is absent — rather than calling it with a placeholder and discarding the result. */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState({ status: "loading" });
    load().then(
      (data) => live && setState({ status: "ready", data }),
      (error) => live && setState({ status: "error", error }),
    );
    return () => {
      live = false;
    };
  }, [...deps, enabled]);
  return state;
}
