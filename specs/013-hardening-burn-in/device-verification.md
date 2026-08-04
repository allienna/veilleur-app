# Device verification (F-013 T-3.3)

Real-iPhone verification of the device-dependent acceptance criteria deferred from F-009/F-010/F-012
(never simulated in Chrome DevTools — R11).

## Status: closed informally, post-talk (2026-08-04)

The talk (M11) has passed and this app is no longer being prepared for a demo audience, so the
original bar — instrumented, stopwatch-measured numbers per AC — is no longer worth the operator's
time to capture. What's tracked here instead is the operator's actual daily-driver experience, which
is the real product now.

| AC | Target | Verified? | Note |
|---|---|---|---|
| F-009 AC-9 — cold-start LCP | ≤2s (ceiling 3s) | Informal pass | Operator: "l'app fonctionne bien sur iPhone" — daily use, no perceived slowness opening the PWA. |
| F-010 AC-7 — LinkedIn share flow | ≤30s | Informal pass | No specific complaint about the copy/save flow; used daily as part of the morning routine. |
| F-012 AC-10 — push delivery on run completion | Delivered reliably | Informal pass | No missed-notification complaints reported. |

**No measured values** (LCP in ms, share-flow duration, push latency) were captured — this is a
deliberate downgrade from the original demo-grade rigor, not an oversight. If a regression is ever
noticed in daily use (slow load, share friction, missing push), re-open this file and measure
properly with real numbers before deciding a fix.
