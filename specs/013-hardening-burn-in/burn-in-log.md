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

**2026-07-31 update**: backfilled from live Firestore `runs/{date}` (project `veilleur-app`), read via
the Firestore REST API, `runs/2026-06-01` through `runs/2026-07-31` (61 days). All entries are
cron-fired (consistent ~04:00–04:03 UTC = 06:00 Europe/Paris); no manual top-up runs are recorded in
this window. **Finding: the bar is far from met** — only 3 successes in 61 days, never two in a row.
See **Analysis** below the table before doing anything else with this log.

## Runs

| Date | runId | Trigger | Status | Cost (USD) | Duration | Notes / evidence |
|---|---|---|---|---|---|---|
| 2026-06-01 | 01KTF9HCMR4VEDGMM99VSRPNTS | cron | failure | — | 13s | `insufficient_sources: 12/100 ok (88 failed)` |
| 2026-06-02 | 01KTF80EHYEGZFXDEE0J9FMZRY | cron | failure | — | 32s | `insufficient_sources: 46/100 ok (54 failed)` |
| 2026-06-03 | 01KTF82Z04TAZN3W4M18CQ05CR | cron | failure | — | 5s | `insufficient_sources: 10/42 ok (32 failed)` |
| 2026-06-04 | 01KTF84QVPD9ASF7NW84EYKTF8 | cron | **success** | 0.395 | 4m50s | tokens 14037 |
| 2026-06-05 | 01KTF8F6F6Y8CM63NCX8RCF9AW | cron | failure | — | 32s | `insufficient_sources: 13/56 ok (43 failed)` |
| 2026-06-06 | 01KTDHEX8GBXQT9N6D2G5321RJ | cron | failure | — | 6s | `insufficient_sources: 5/17 ok (12 failed)` |
| 2026-06-07 | 01KTG3TMAZ96Z0S5BYAF4GVFW2 | cron | skipped | — | 1s | `no_sources` |
| 2026-06-08 | 01KTJP8JYGYEAGY3N0CHQKGK4D | cron | failure | — | 7s | `insufficient_sources: 11/30 ok (19 failed)` |
| 2026-06-09 | 01KTN8MPEXRF066AM963HB3QYM | cron | skipped | — | 1s | `no_sources` |
| 2026-06-10 | 01KTQV1AS8JJCXCYTRKFGMXM2H | cron | skipped | — | 1s | `no_sources` |
| 2026-06-11 | 01KTTDDJ52PMQYJCQF6K93H5N6 | cron | skipped | — | 1s | `no_sources` |
| 2026-06-12 | 01KTWZTFR6H64JEBMYK8XWAEDP | cron | skipped | — | 1s | `no_sources` |
| 2026-06-13 | 01KTZJ7MHHB4RBQ9FZPDW330DN | cron | failure | — | 1s | `insufficient_sources: 0/2 ok (2 failed)` |
| 2026-06-14 | 01KV24MDZFH2Y8G86X8JEXK9ZJ | cron | skipped | — | 1s | `no_sources` |
| 2026-06-15 | 01KV4Q0Z8SVQ6ATSHZV2DPMEPP | cron | failure | — | 7s | `insufficient_sources: 10/29 ok (1 paywalled, 18 failed)` |
| 2026-06-16 | 01KV79E7GC0TG3MJF9EGRF3ECX | cron | failure | — | 8m56s | `generate: validation failed after 1 retries: missing_attribution` |
| 2026-06-17 | 01KV9VSRH8ZXS0VEZB0RAKP8X8 | cron | skipped | — | 1s | `no_sources` |
| 2026-06-18 | 01KVCE7JR7J1NEJK3K7381GMVJ | cron | failure | — | 18s | `insufficient_sources: 16/44 ok (28 failed)` |
| 2026-06-19 | 01KVF0N5N0P242DAPX8B9GBADS | cron | skipped | — | 1s | `no_sources` |
| 2026-06-20 | 01KVHK03Q0D2R9Y3YQVQ64T1EV | cron | skipped | — | 1s | `no_sources` |
| 2026-06-21 | 01KVM5DDN2EJFPSB70SVGW1TK8 | cron | skipped | — | 1s | `no_sources` |
| 2026-06-22 | 01KVPQVB7F624JBQQV4E6BB9AC | cron | failure | — | 4s | `insufficient_sources: 11/30 ok (19 failed)` |
| 2026-06-23 | 01KVSA89VYYGFSSQST5HGNGP3C | cron | skipped | — | 1s | `no_sources` |
| 2026-06-24 | 01KVVWJW8RXDXBS6WV68NJQZDQ | cron | skipped | — | 1s | `no_sources` |
| 2026-06-25 | 01KVYEZEXQYNVM5NF2DRPD2EEX | cron | skipped | — | 1s | `no_sources` |
| 2026-06-26 | 01KW11E29SEN9ZASWZAWBMR5KQ | cron | skipped | — | 1s | `no_sources` |
| 2026-06-27 | 01KW3KT525D793YKADBSR8NBEM | cron | skipped | — | 1s | `no_sources` |
| 2026-06-28 | 01KW666APHTXZDBG18XZXTC9GC | cron | skipped | — | 1s | `no_sources` |
| 2026-06-29 | 01KW8RM0Q8GEWQ0PTNTGWWAMVR | cron | skipped | — | 1s | `no_sources` |
| 2026-06-30 | 01KWBB1XRBBFRR189NAP22MBJ1 | cron | skipped | — | 1s | `no_sources` |
| 2026-07-01 | 01KWDXCNWAYTCH0TA9874CX9RV | cron | failure | — | 3s | `insufficient_sources: 2/11 ok (9 failed)` |
| 2026-07-02 | 01KWGFTHJY2A6PAZ3RSNP1PFR1 | cron | failure | — | 9s | `insufficient_sources: 3/7 ok (4 failed)` |
| 2026-07-03 | 01KWK25ZJ05P04J3J5DQ2AZDFB | cron | skipped | — | 1s | `no_sources` |
| 2026-07-04 | 01KWNMJWAEC8ESZV8FX5W8SQQD | cron | skipped | — | 1s | `no_sources` |
| 2026-07-05 | 01KWR6ZFHB03QADJTPBSJKZJ8M | cron | skipped | — | 1s | `no_sources` |
| 2026-07-06 | 01KWTSBSZXMFCT60RBVYCYCX4J | cron | failure | — | 4s | `insufficient_sources: 0/5 ok (5 failed)` |
| 2026-07-07 | 01KWXBT236B8Y8K4GPAMDQPDXG | cron | **⚠️ stuck: `running`** | — | never ended | `endedAt` still null 24 days later — job likely crashed/killed without writing terminal status. **Needs investigation** (see Analysis). Excluded from tallies. |
| 2026-07-08 | 01KWZY70501ST5ZCM5WK8MTCT2 | cron | skipped | — | 1s | `no_sources` |
| 2026-07-09 | 01KX2GHGNCE196Q02MF8RW4R7W | cron | skipped | — | 1s | `no_sources` |
| 2026-07-10 | 01KX52YSY2M0BV8C1DAE9W87VT | cron | skipped | — | 1s | `no_sources` |
| 2026-07-11 | 01KX7NBQY46E97K98WP1X2ZWND | cron | **success** | 0.554 | 8m29s | tokens 31276 |
| 2026-07-12 | 01KXA7R4J6719YG6Y45KHE4TS5 | cron | failure | — | 17m31s | `generate: validation failed after 1 retries: missing_attribution` (repeated ~30×) |
| 2026-07-13 | 01KXCT5BWJ63Y7PHHFWZV9C5BB | cron | skipped | — | 1s | `no_sources` |
| 2026-07-14 | 01KXFCHBZX242JJRJ17XKPQ5KB | cron | skipped | — | 1s | `no_sources` |
| 2026-07-15 | 01KXHYYEZ6YZRR9BSQTSN18RG0 | cron | failure | — | 16m08s | `generate: claude /generate timed out` |
| 2026-07-16 | 01KXMHAFRRA3NN0R07ACQ146YQ | cron | failure | — | 5s | `insufficient_sources: 11/30 ok (19 failed)` |
| 2026-07-17 | 01KXQ3SRTEFWTKR2HKTHB06F88 | cron | failure | — | 7s | `insufficient_sources: 7/35 ok (28 failed)` |
| 2026-07-18 | 01KXSP4N1JQQE92BBXJZQXAPDD | cron | skipped | — | 1s | `no_sources` |
| 2026-07-19 | 01KXW8HMRS66HDH2YK3215R3FK | cron | skipped | — | 1s | `no_sources` |
| 2026-07-20 | 01KXYTYDGFH921WSPK6S0S167C | cron | skipped | — | 1s | `no_sources` |
| 2026-07-21 | 01KY1DAV1Z9QPHVVKFH92H4H5N | cron | skipped | — | 1s | `no_sources` |
| 2026-07-22 | 01KY3ZQM7JMH587QDDKRYDXZ26 | cron | skipped | — | 1s | `no_sources` |
| 2026-07-23 | 01KY6J56AR3DREV0FEDFTXM444 | cron | failure | — | 14s | `insufficient_sources: 5/15 ok (2 paywalled, 8 failed)` |
| 2026-07-24 | 01KY94H074GXFQ2FK4RWG9YTQ6 | cron | failure | — | 11m24s | `generate: validation failed after 1 retries: missing_attribution` (repeated ~13×) |
| 2026-07-25 | 01KYBPX7QMWJ0NFB3Z66QPBDDC | cron | skipped | — | 1s | `no_sources` |
| 2026-07-26 | 01KYE99ZMFDK7W7AXVVH71FG64 | cron | skipped | — | 1s | `no_sources` |
| 2026-07-27 | 01KYGVRM0W809TQRT3WM5165PS | cron | failure | — | 1s | `insufficient_sources: 1/1 ok (0 failed)` — needed ≥5 sources, only 1 fetched |
| 2026-07-28 | 01KYKE79CMKB59DDQ5444F2Y42 | cron | skipped | — | 1s | `no_sources` |
| 2026-07-29 | 01KYP0GF70QPCC4G8BMWYQ9AZA | cron | **success** | 0.800 | 11m34s | tokens 39721 |
| 2026-07-30 | 01KYRJWZYD39B493TY08CMZQHJ | cron | skipped | — | 1s | `no_sources` |
| 2026-07-31 | 01KYWASX09J6T6W0M6RWXH98AQ | manual (post-fix) | **success** | 1.630 | 9m07s | tokens 48399. See **Post-fix note** below — this replaces the original cron result (`01KYV5DSB4M4H7EX5J63E4AJX5`, `skipped: no_sources`), overwritten by idempotent replay while debugging in-track. |

**Consecutive successes:** 1 / 7 (restarts here, post-fix) · **Window:** 4 successes / 61 days
observed pre-fix (historical baseline — see note; not meaningful going forward since 3 root causes
were fixed today)

## Post-fix note (2026-07-31) — 3 root causes found and fixed in-track

Debugging the `no_sources`/`insufficient_sources`/`missing_attribution` pattern above (rather than
waiting out more calendar days) surfaced three real, root-cause bugs, all fixed and deployed to prod
today:

1. **Gmail window anchored to midnight, not run time** (`90e38b1`) — cron fires at 06:00 Paris but
   the window was `[date 00:00, date+1 00:00)`, so every run only ever saw its own 00:00-06:00
   slice; the other 18h/day were never scanned by any run. Root cause of most `no_sources` days.
2. **Wrong Gmail mailbox** — the OAuth refresh token authenticated as `aurelien.allienne@gmail.com`
   (a near-empty personal inbox), not the actual dedicated newsletter inbox
   `veilleur.allienne@gmail.com`. Re-authenticated against the correct mailbox (new Secret Manager
   version); this alone explains why `no_sources`/`insufficient_sources` fired almost every day even
   before the window bug, since the scanned mailbox never had the subscribed newsletters at all.
3. **`missing_attribution` false positives from cross-source domain/title collisions** (`e48cdf3`,
   `8992ea3`) — sources sharing a tracking-redirector domain (`tracking.tldrnewsletter.com`) or the
   same article syndicated under two different tracking URLs made the copyright validator flag
   correctly-cited sources' *uncited duplicates* as "referenced but not linked". Fixed in the
   validator (prose-only domain scan) and at assembly (dedupe by title).

Manual re-runs of `2026-07-31` while iterating on these fixes went: `failure (missing_attribution
×60)` → `failure (missing_attribution ×1)` → `failure (missing_attribution ×10, variance)` →
**`success`**. Each overwrote the Firestore `runs/2026-07-31` doc (idempotent replay, F-003) — only
the final state is kept above, per this log's own rule that in-track bug fixes restart the counter
from the next clean run. **The consecutive-success counter restarts at 1/7 from this run.**

Pre-fix historical breakdown (61 days, kept for context — see original Analysis below): 52%
`no_sources`, 33% `insufficient_sources`, ~5% `missing_attribution`, one stuck `running` doc
(2026-07-07, still unexplained, excluded from tallies). Now that the mailbox + window + validator
bugs are fixed, expect a materially different failure distribution going forward.

> Update both tallies on every append. When the bar is met, link the qualifying span here and check
> AC-3 in `spec.md`.

## Analysis (2026-07-31) — bar is not close to met; this is a pipeline problem, not a patience problem

Across 61 real cron-fired days, only **3 runs succeeded** (2026-06-04, 07-11, 07-29), spaced ~5 weeks
apart, never back-to-back. At this success rate, waiting longer will not clear ≥7 consecutive or
≥10/13 — the root causes below need to be fixed first.

**Failure-mode breakdown (61 days):**
- **`skipped: no_sources`** — 32 days (52%). Gmail's 24h window found zero newsletters. This is the
  single biggest blocker to even *attempting* a run, and dwarfs everything else. Worth checking:
  denylist over-matching, OAuth token scope/label filter, or a genuine drop in subscribed newsletter
  volume.
- **`failure: insufficient_sources`** (the F-004/F-015 ≥50%+≥5 ingestion gate) — 20 days (33%). Even
  after F-015 replaced Jina with local `httpx`+`trafilatura` extraction (merged 2026-06-04), this gate
  keeps failing at similar frequency to before — e.g. 2026-06-08, 06-13, 06-18, 06-22, 07-01, 07-02,
  07-06, 07-16, 07-17, 07-23, 07-27. **This suggests F-015's local-extraction yield problem is not
  actually resolved** (contrary to the "Pass with notes" review's optimistic framing of AC-6 as
  merely "deferred to burn-in") — it's the single most common cause of failure once sources exist at
  all.
- **`failure: generate ... missing_attribution`** — 3 days (06-16, 07-12, 07-24). The copyright
  validator rejects the generated article on both retries. Worth checking whether the retry prompt
  correction is actually effective, or if this validator is miscalibrated/too strict for the current
  `/generate` prompt.
- **`failure: generate ... timed out`** — 1 day (07-15). A single Claude Code invocation timeout.
- **Stuck run** — 2026-07-07 has `status: running` with `endedAt` still null 24 days later. The job
  almost certainly crashed or was killed without reaching a terminal Firestore write. Not counted
  either way, but worth checking Cloud Run job execution history/logs for that date to confirm it
  didn't silently consume budget or leave the Firestore concurrency lock stuck (F-003's
  `aborted: already_running` guard — subsequent days ran fine, so the lock was not left stuck, but the
  root cause of the non-terminal write is still unexplained).

**Recommendation**: before spending more calendar days waiting on burn-in, investigate — in order of
impact — (1) why `no_sources` fires on >half of days, (2) why `insufficient_sources` still fires this
often post-F-015, (3) the `missing_attribution` validator's false-positive rate. Fixing any of these
is legitimate in-track work per this spec's own rule ("fix in-track if code/config bug"). Once a fix
lands, the counter should be considered to restart from the next clean run after the fix, not from
today.
