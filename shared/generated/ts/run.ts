/* eslint-disable */
/**
 * AUTO-GENERATED from shared/schema — DO NOT EDIT BY HAND.
 * Regenerate with: pnpm --filter @veilleur/shared run gen
 */

/**
 * Terminal and in-flight status tokens for a Minion run. Mirrors DESIGN.md §1 run-status tokens and PRD §6 status verbs. Source of truth for both the PWA (supervision UI) and the Minion (Firestore writes).
 */
export type RunStatus = "success" | "success_with_warnings" | "failure" | "skipped" | "aborted" | "running";

/**
 * Skeleton shape of a Minion run document and its per-step children. Minimal on purpose — the full model lands in F-003. Source of truth for Firestore docs (Minion) and the supervision listener (PWA).
 */
export interface Run {
  /**
   * Unique identifier for this run.
   */
  runId: string;
  /**
   * Run date in YYYY-MM-DD (Europe/Paris). Idempotency key.
   */
  date: string;
  status: RunStatus;
  /**
   * ISO-8601 timestamp when the run began.
   */
  startedAt?: string;
  /**
   * ISO-8601 timestamp when the run finished; null while running.
   */
  endedAt?: string | null;
  /**
   * Ordered per-step records.
   */
  steps: RunStep[];
}
export interface RunStep {
  /**
   * Step name (e.g. gmail, jina, generate, imagen, github).
   */
  name: string;
  status: RunStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  /**
   * Error message if the step failed; null otherwise.
   */
  error?: string | null;
}
