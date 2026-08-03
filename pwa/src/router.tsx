import { createBrowserRouter, Outlet } from "react-router-dom";

import { AppShell } from "@/components/AppShell";

// Lazy routes keep the Today path's first chunk small (LCP, F-009 AD-4 / AC-9).
function RootLayout(): JSX.Element {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("@/routes/Today")).default }) },
      {
        path: "history",
        lazy: async () => ({ Component: (await import("@/routes/History")).default }),
      },
      {
        path: "article/:date",
        lazy: async () => ({ Component: (await import("@/routes/Article")).default }),
      },
      {
        path: "fiches",
        lazy: async () => ({ Component: (await import("@/routes/Fiches")).default }),
      },
      {
        path: "fiches/:slug",
        lazy: async () => ({ Component: (await import("@/routes/Fiche")).default }),
      },
      {
        path: "supervision",
        lazy: async () => ({ Component: (await import("@/routes/Supervision")).default }),
      },
      {
        path: "runs/:date",
        lazy: async () => ({ Component: (await import("@/routes/Run")).default }),
      },
    ],
  },
]);
