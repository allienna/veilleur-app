import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthProvider";
import { useAuth } from "@/auth/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SignInScreen } from "@/components/SignInScreen";
import { UnauthorizedScreen } from "@/components/UnauthorizedScreen";
import { router } from "@/router";

// The auth gate (F-009 AD-3): one place decides sign-in / unauthorized / routed app.
function Gate(): JSX.Element {
  const { status, error, signIn, signOut } = useAuth();
  switch (status) {
    case "loading":
      return <div className="min-h-dvh bg-bg" aria-busy="true" />;
    case "signed-out":
      return <SignInScreen onSignIn={signIn} error={error ?? undefined} />;
    case "unauthorized":
      return <UnauthorizedScreen onSignOut={signOut} />;
    case "ready":
      return <RouterProvider router={router} />;
  }
}

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ErrorBoundary>
  );
}
