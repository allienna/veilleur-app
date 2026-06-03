import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ErrorBanner";
import { log } from "@/lib/log";

interface Props {
  children: ReactNode;
}
interface State {
  crashed: boolean;
}

// `ErrorBoundary` — full-page recovery for a component crash (DESIGN §4 Error). Emits a
// structured `pwa.boundary` log line; never a dead end (offers Recharger).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log("error", {
      event: "pwa.boundary",
      message: error.message,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-bg px-md">
        <div className="w-full max-w-sm space-y-md">
          <ErrorBanner message="Une erreur est survenue." />
          <Button className="w-full" onClick={() => window.location.reload()}>
            Recharger
          </Button>
        </div>
      </div>
    );
  }
}
