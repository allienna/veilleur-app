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
 * The ten canonical Minion pipeline steps, in execution order.
 */
export type StepName =
  | "gmail"
  | "jina"
  | "validate_input"
  | "assemble"
  | "generate"
  | "validate_output"
  | "imagen"
  | "github"
  | "publish"
  | "fiches";

/**
 * Shape of a Minion run document and its per-step children. The run is keyed in Firestore by `date` (the idempotency key); `runId` is a ULID stored as a field, fresh per attempt (F-003 AD-1). Source of truth for Firestore docs (Minion) and the supervision listener (PWA).
 */
export interface Run {
  /**
   * ULID for this run attempt. Disambiguates attempts in logs/history; the Firestore document key is `date`, not this value.
   */
  runId: string;
  /**
   * Run date in YYYY-MM-DD (Europe/Paris). Firestore document key and idempotency key.
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
   * Run-level failure or abort reason (e.g. "already_running"); null on success.
   */
  error?: string | null;
  /**
   * Total LLM cost for the run in USD (the `claude` CLI's native unit, from `total_cost_usd`). Null when the run never reached the `generate` step (e.g. skipped/no_sources or an early failure).
   */
  costUsd?: number | null;
  /**
   * Total LLM tokens (input + output) consumed by the `generate` step. Null when no generation ran (see `costUsd`).
   */
  tokens?: number | null;
  /**
   * Ordered per-step records.
   */
  steps: RunStep[];
}
export interface RunStep {
  name: StepName;
  status: RunStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  /**
   * Error message if the step failed; null otherwise.
   */
  error?: string | null;
}
