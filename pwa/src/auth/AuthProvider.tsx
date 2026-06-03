import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from "firebase/auth";
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { type AuthStatus, deriveStatus } from "@/auth/authStatus";
import { auth } from "@/firebase";

export interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// `AuthProvider` — single top-level gate over Firebase Auth (F-009 AD-3). Wraps the app;
// derives the soft allowed/verified status. The real boundary remains Firestore Rules.
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      // Clear any stale sign-in error: it belongs to the previous attempt, not this state.
      setError(null);
      setEmail(user?.email ?? null);
      setStatus(
        deriveStatus(user ? { email: user.email, emailVerified: user.emailVerified } : null),
      );
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      email,
      error,
      signIn: () => {
        setError(null);
        signInWithPopup(auth, new GoogleAuthProvider()).catch(() =>
          setError("La connexion a échoué. Réessayez."),
        );
      },
      signOut: () => void fbSignOut(auth),
    }),
    [status, email, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
