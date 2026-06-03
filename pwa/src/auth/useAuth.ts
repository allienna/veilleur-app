import { useContext } from "react";

import { AuthContext, type AuthContextValue } from "@/auth/AuthProvider";

/** Access the auth gate context. Throws if used outside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
