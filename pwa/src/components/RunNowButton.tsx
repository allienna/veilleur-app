import { useState } from "react";

import { Button } from "@/components/ui/button";
import { triggerRun } from "@/data/trigger";
import { useOnline } from "@/lib/useOnline";

type State = "idle" | "loading" | "error";

// `RunNowButton` — the manual trigger CTA (DESIGN §2; FR-E1). idle → loading → on success
// `onTriggered(date)` (the caller navigates to the live view) | on failure an inline error,
// returning to idle on the next press. Disabled while today's run is in progress (`runInProgress`)
// or offline (caption-replacement "Connexion requise", DESIGN §4 offline).
export function RunNowButton({
  runInProgress = false,
  onTriggered,
}: {
  runInProgress?: boolean;
  onTriggered: (date: string) => void;
}): JSX.Element {
  const online = useOnline();
  const [state, setState] = useState<State>("idle");
  const disabled = runInProgress || !online || state === "loading";

  async function handleClick(): Promise<void> {
    setState("loading");
    try {
      const date = await triggerRun();
      setState("idle");
      onTriggered(date);
    } catch {
      setState("error");
    }
  }

  const caption = !online
    ? "Connexion requise"
    : runInProgress
      ? "Un run est déjà en cours"
      : state === "error"
        ? "Échec du déclenchement. Réessayez."
        : null;

  return (
    <div className="flex flex-col items-center gap-xs">
      <Button onClick={() => void handleClick()} disabled={disabled} aria-busy={state === "loading"}>
        {state === "loading" ? "Lancement…" : "Lancer un run"}
      </Button>
      {caption ? (
        <p
          className={state === "error" ? "text-caption text-status-error" : "text-caption text-fg-muted"}
        >
          {caption}
        </p>
      ) : null}
    </div>
  );
}
