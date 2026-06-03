import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { currentState, subscribe, unsubscribe, type PushState } from "@/data/pushSubscriptions";

const TOAST_MS = 2000;

// `NotificationOptIn` (DESIGN §2) — Web Push enable/disable control (F-012 FR-2). Requests
// permission, subscribes, reflects state. On iOS the Push API only exists once the PWA is
// home-screen installed (iOS 16.4+), so the "unsupported" path surfaces that prerequisite as
// inline guidance (DESIGN §4), never a banner or icon-only control.
export function NotificationOptIn(): JSX.Element | null {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void currentState()
      .then((s) => active && setState(s))
      .catch(() => active && setState("unsupported"));
    return () => {
      active = false;
    };
  }, []);

  async function handleEnable(): Promise<void> {
    setBusy(true);
    try {
      const next = await subscribe();
      setState(next);
      if (next === "subscribed") toast.success("Notifications activées", { duration: TOAST_MS });
      else if (next === "denied")
        toast.error("Notifications refusées", { duration: TOAST_MS });
    } catch {
      toast.error("Échec de l'activation", { duration: TOAST_MS });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(): Promise<void> {
    setBusy(true);
    try {
      setState(await unsubscribe());
      toast.success("Notifications désactivées", { duration: TOAST_MS });
    } catch {
      toast.error("Échec de la désactivation", { duration: TOAST_MS });
    } finally {
      setBusy(false);
    }
  }

  // While the platform support / current state is still resolving, render nothing.
  if (state === "loading") return null;

  // iOS before home-screen install (or any browser without the Push API): inline guidance only.
  if (state === "unsupported") {
    return (
      <p className="text-caption text-fg-muted" role="note">
        Pour les notifications, ajoutez l'app à l'écran d'accueil (iOS 16.4+).
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="text-caption text-fg-muted" role="note">
        Notifications bloquées. Autorisez-les dans les réglages de l'app.
      </p>
    );
  }

  const subscribed = state === "subscribed";
  return (
    <Button
      variant={subscribed ? "secondary" : "primary"}
      disabled={busy}
      aria-busy={busy}
      aria-label={subscribed ? "Désactiver les notifications" : "Activer les notifications"}
      onClick={() => void (subscribed ? handleDisable() : handleEnable())}
    >
      {subscribed ? "Désactiver les notifications" : "Activer les notifications"}
    </Button>
  );
}
