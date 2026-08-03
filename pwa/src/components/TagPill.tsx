// `TagPill` — theme tag on article cards (mirrors Astro TagPill.astro exactly: rounded-full,
// bold uppercase, tracked-out — DESIGN §2's Badge is a different, more muted shape reused
// elsewhere (StatusPill), so this tag pill styles itself rather than bending Badge to fit both).
export function TagPill({ label }: { label: string }): JSX.Element {
  return (
    // `px-3 py-1` are the Astro pill's exact paddings (12px/4px); the tighter token pair read as
    // a label rather than a bubble.
    <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
      {label}
    </span>
  );
}
