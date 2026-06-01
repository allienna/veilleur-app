/* eslint-disable */
/**
 * AUTO-GENERATED from shared/schema — DO NOT EDIT BY HAND.
 * Regenerate with: pnpm --filter @veilleur/shared run gen
 */

/**
 * Terminal and in-flight status tokens for a Minion run. Mirrors DESIGN.md §1 run-status tokens and PRD §6 status verbs. Source of truth for both the PWA (supervision UI) and the Minion (Firestore writes).
 */
export type RunStatus = "success" | "success_with_warnings" | "failure" | "skipped" | "aborted" | "running";
