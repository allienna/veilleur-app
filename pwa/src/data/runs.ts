import type { Run, RunStep, StepName } from "@veilleur/shared/run";
import {
  collection,
  doc,
  documentId,
  getDocs,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import { db } from "@/firebase";

const RUNS = "runs";
const STEPS = "steps";

// The nine canonical pipeline steps in execution order (mirrors the Minion's StepName enum and
// `STEP_ORDER`). The timeline always renders all nine; steps absent from the subcollection are
// pending. Kept as a literal here so the order is explicit and independent of object iteration.
export const STEP_ORDER: readonly StepName[] = [
  "gmail",
  "jina",
  "validate_input",
  "assemble",
  "generate",
  "validate_output",
  "imagen",
  "github",
  "publish",
];

/**
 * Reassemble a schema-shaped `Run` from the run-level document and its `steps` subcollection
 * docs (F-011 AD-1) — the mirror of the Minion's `FirestoreRunStore.get_run`. Steps are ordered
 * by `STEP_ORDER`; a step missing from `stepDocs` is rendered pending (status "running" with no
 * timestamps would be misleading, so absent steps are simply omitted and the timeline fills the
 * gaps). `runDoc` may be undefined while the run-level snapshot hasn't arrived yet.
 */
export function assembleRun(
  date: string,
  runDoc: DocumentData | undefined,
  stepDocs: DocumentData[],
): Run | null {
  if (!runDoc) return null;
  const byName = new Map<string, RunStep>();
  for (const s of stepDocs) byName.set(s.name as string, s as RunStep);
  const steps: RunStep[] = STEP_ORDER.flatMap((name) => {
    const s = byName.get(name);
    return s ? [s] : [];
  });
  return {
    runId: runDoc.runId as string,
    date,
    status: runDoc.status,
    startedAt: runDoc.startedAt ?? undefined,
    endedAt: runDoc.endedAt ?? null,
    error: runDoc.error ?? null,
    costUsd: runDoc.costUsd ?? null,
    tokens: runDoc.tokens ?? null,
    steps,
  };
}

/**
 * Live-subscribe to `runs/{date}` and its `steps` subcollection, invoking `cb` with the assembled
 * `Run` (or null until the run doc exists) on every change (FR-D1, ≤2s). Two `onSnapshot`
 * listeners: either may fire first, so the latest of each is held and re-assembled on each tick.
 * Returns an unsubscribe that tears down both. `onError` surfaces a listener failure (e.g. a
 * permission error) so the caller can show it rather than hang on "loading".
 */
export function subscribeRun(
  date: string,
  cb: (run: Run | null) => void,
  onError?: (err: Error) => void,
  store: Firestore = db,
): () => void {
  let runDoc: DocumentData | undefined;
  let stepDocs: DocumentData[] = [];
  let haveRun = false;
  let active = true;

  const emit = () => {
    // `active` guards the narrow window where a steps snapshot flushes synchronously between the
    // two unsubscribe calls below — without it `cb` could fire after teardown (stale setState).
    if (active && haveRun) cb(assembleRun(date, runDoc, stepDocs));
  };

  const unsubRun = onSnapshot(
    doc(store, RUNS, date),
    (snap) => {
      haveRun = true;
      runDoc = snap.exists() ? snap.data() : undefined;
      emit();
    },
    onError,
  );
  const unsubSteps = onSnapshot(
    collection(store, RUNS, date, STEPS),
    (snap) => {
      stepDocs = snap.docs.map((d) => d.data());
      emit();
    },
    onError,
  );

  return () => {
    active = false;
    unsubRun();
    unsubSteps();
  };
}

/**
 * The most recent runs, newest-first (FR-D2; must-have ≥7, target ≤30). Ordered by document id
 * (the `YYYY-MM-DD` date key — lexicographically sortable, no composite index). Step children are
 * not fetched here — the history list shows run-level fields only.
 */
export async function listRecentRuns(max = 30, store: Firestore = db): Promise<Run[]> {
  const q = query(collection(store, RUNS), orderBy(documentId(), "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => assembleRun(d.id, d.data(), [])).filter((r): r is Run => r !== null);
}
