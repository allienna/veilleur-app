import { Badge } from "@/components/ui/badge";

// `TagPill` — theme tag on article cards (mirrors Astro TagPill.astro). DESIGN §2.
export function TagPill({ label }: { label: string }): JSX.Element {
  return <Badge variant="primary">{label}</Badge>;
}
