import { getIdToken } from "firebase/auth";

import { TRIGGER_API_URL } from "@/config";
import { auth } from "@/firebase";

/** A failed manual trigger, carrying the HTTP-ish reason so the UI can map it to a message. */
export class TriggerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TriggerError";
  }
}

/** The minimal trigger-api success body (F-008): `202 { date, execution }`. */
interface TriggerResponse {
  date: string;
  execution: string;
}

export interface TriggerDeps {
  /** Resolve the current operator's Firebase ID token. Defaults to the live signed-in user. */
  token: () => Promise<string>;
  fetch: typeof fetch;
}

function defaultDeps(): TriggerDeps {
  return {
    token: async () => {
      const user = auth.currentUser;
      if (!user) throw new TriggerError("not signed in", 401);
      return getIdToken(user);
    },
    fetch: (...args) => fetch(...args),
  };
}

/**
 * Trigger a manual run via the trigger-api (FR-E1). POSTs `${TRIGGER_API_URL}/trigger` with the
 * operator's Firebase ID token as a Bearer credential and an optional `{ date }` body (omit to let
 * the service resolve "today" in Europe/Paris, matching the Minion). Returns the run `date` — the
 * Firestore document key the caller navigates to (`/runs/:date`); `execution` is the Cloud Run
 * execution name and is not a doc key. Throws `TriggerError` on any non-202 response.
 */
export async function triggerRun(date?: string, deps: TriggerDeps = defaultDeps()): Promise<string> {
  const jwt = await deps.token();
  const res = await deps.fetch(`${TRIGGER_API_URL}/trigger`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(date ? { date } : {}),
  });

  if (res.status !== 202) {
    throw new TriggerError(`trigger failed (${res.status})`, res.status);
  }
  const body = (await res.json()) as TriggerResponse;
  return body.date;
}
