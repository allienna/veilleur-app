import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TrendTone = "success" | "warning" | "error" | "neutral";

const BAR_TONE: Record<TrendTone, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-error",
  neutral: "bg-status-neutral",
};

// `TrendStat` (DESIGN §2, added 2026-08-04 for F-016) — a label, a big pre-formatted value, and a
// CSS-only micro-bar (no chart/SVG library). The bar is decorative (`aria-hidden`); the label +
// value text carry the actual information, per DESIGN §5 color-independence.
export function TrendStat({
  label,
  value,
  fraction,
  tone,
}: {
  label: string;
  value: string;
  /** 0-1, clamped — drives the micro-bar width. */
  fraction: number;
  tone: TrendTone;
}): JSX.Element {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <Card className="flex flex-col gap-sm p-md">
      <span className="text-caption text-fg-muted">{label}</span>
      <span className="font-mono text-h2 text-fg">{value}</span>
      <span aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-border-subtle">
        <span
          className={cn("block h-full rounded-full", BAR_TONE[tone])}
          style={{ width: `${clamped * 100}%` }}
        />
      </span>
    </Card>
  );
}
