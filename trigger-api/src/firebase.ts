// Production `TokenVerifier` over firebase-admin (F-008 plan AD-2). Verifies a Firebase Auth ID
// token (signature/JWKS/aud/iss/exp via verifyIdToken) for the veilleur-app project. Any failure
// becomes `UnauthenticatedError` (→ HTTP 401). No secrets in source — identity via ADC.

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { UnauthenticatedError, type TokenClaims } from "./ports.js";

const PROJECT_ID = process.env.PROJECT_ID ?? "veilleur-app";

function ensureApp(): void {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
}

export async function verifyToken(idToken: string): Promise<TokenClaims> {
  ensureApp();
  try {
    // checkRevoked=true: reject tokens for disabled/revoked sessions.
    const decoded = await getAuth().verifyIdToken(idToken, true);
    return {
      email: decoded.email ?? "",
      emailVerified: decoded.email_verified === true,
    };
  } catch {
    throw new UnauthenticatedError("invalid Firebase ID token");
  }
}
