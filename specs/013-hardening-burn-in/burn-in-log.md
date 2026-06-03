# Burn-in log (F-013 FR-2 / AC-3)

Rolling record of production daily runs through the pre-talk window. One row per run (cron-fired or
manual top-up). Evidence — Firestore `runs/{date}` doc, the published commit URL — is referenced from
the **Notes** column.

## Acceptance bar

- **≥7 consecutive successful runs** (publishable article without intervention), AND
- **≥10/13 OK** on the full rolling window (re-baselined from the PRD's ≥18/21 — shorter window,
  equivalent quality bar; see `specs/roadmap.md` §Calendar reality).

## Counting rules

- `success` and `success_with_warnings` **both count as success** for the consecutive-success bar.
  `success_with_warnings` is noted in **Notes** (e.g. Imagen moderation placeholder fallback, R2).
- `failure` resets the consecutive-success counter. Every failure gets a root-cause line. If the
  cause is a code/config bug, it is fixed **in-track** (hardening is the point) and the counter
  restarts from the next clean run.
- `skipped: no_sources` is **not** a failure (no newsletters in the 24h window) — note it; it neither
  advances nor resets the consecutive counter (no article was due).
- `aborted: already_running` is an operational artefact, not a pipeline outcome — note and exclude.

## Window

Re-baselined calendar (today 2026-06-03): M8 burn-in **2026-06-05**, M10 backup video **2026-06-09**,
M11 talk **2026-06-11**. Burn-in starts day 1 of this track; manual top-up runs pad the window
(`gcloud run jobs execute minion --region=europe-west1 --wait`, or the PWA RunNowButton).

## Runs

| Date | runId | Trigger | Status | Cost (USD) | Duration | Notes / evidence |
|---|---|---|---|---|---|---|
| _backfill_ | | cron / manual | | | | _Backfill any runs already landed before this log existed, from Firestore `runs/{date}` + the publish commit. Do not fabricate — leave blank until confirmed._ |

**Consecutive successes:** 0 / 7 · **Window:** 0 / 13 OK

> Update both tallies on every append. When the bar is met, link the qualifying span here and check
> AC-3 in `spec.md`.
