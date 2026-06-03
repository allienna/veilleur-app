import { ALLOWED_OPERATOR_EMAIL } from "@/config";

export type AuthStatus = "loading" | "signed-out" | "unauthorized" | "ready";

/** Minimal user shape the gate needs (subset of Firebase User). */
export interface GateUser {
  email: string | null;
  emailVerified: boolean;
}

/**
 * Derive the gate status (F-009 AD-3, FR-2). This is the UX-only soft check — the real
 * boundary is Firestore Rules. `null` user (not yet signed in) → signed-out.
 */
export function deriveStatus(user: GateUser | null): Exclude<AuthStatus, "loading"> {
  if (!user) return "signed-out";
  const allowed = user.email === ALLOWED_OPERATOR_EMAIL && user.emailVerified;
  return allowed ? "ready" : "unauthorized";
}
