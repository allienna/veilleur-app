import { EmptyState } from "@/components/EmptyState";

// Supervision (`/supervision`) — the nav target exists per DESIGN §3; the live
// RunTimeline / trigger surface is built in F-011. Placeholder until then.
export default function SupervisionPlaceholder(): JSX.Element {
  return (
    <EmptyState
      title="Supervision"
      subline="La supervision en temps réel des runs arrive bientôt (F-011)."
    />
  );
}
