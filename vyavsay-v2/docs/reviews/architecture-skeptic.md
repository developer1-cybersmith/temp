# Skeptic review: docs/02-architecture.md

**Summary**
1. Verdict: revise. Solid shape, no owner decision contradicted, but 5 blockers.
2. Main holes: R4 vs system-level DB access, claim SQL inconsistent, Sheets inline in api, media URLs vs frontend, `/sessions` paused state.
3. Several unverified claims are not marked verify (Supabase direct connection, advisory locks).
4. Tests and some audit items (M-04, M-10, M-24, H-36, H-31) have no home.
5. Pilot infra looks heavy for zero live tenants; define a cut line.

## Blockers
1. **R4 contradicts the design.** R4 says every DB access goes through `tenant_tx(tenant_id)`. But the webhook must map `endpoint_key` to a tenant before any tenant exists, and the job claim, 15 s scheduler tick (reads `followups` across tenants), `getMyInfo` health sweep and token-refresh sweep are all cross-tenant. ADR 0002 allows cross-tenant reads only for "queue-claim tables, claim columns". Add an explicit "system access" tier: a few SECURITY DEFINER functions (resolve_endpoint_key, claim_jobs, enqueue_due_followups, list_numbers_for_health) with a CI probe, and fix R4/ADR 0002 wording.
2. **Claim SQL is wrong as written (section 3).** It selects `status='queued' AND locked_until<now()`: (a) a job whose worker died has status `running`, so it is never reclaimed; (b) `locked_until` NULL on new rows fails the comparison; (c) "partial unique index on active status" for one job per conversation will reject enqueueing a second queued job unless "active" means `running` only, and then claim must handle the unique violation; (d) the per-tenant fairness cap is claimed but absent from the SQL. Rewrite and add a test (two workers, expired lease, same conversation).
3. **Sheets sync inline in `api` (section 8).** Breaks R5 and "api is insert-only/stateless", and runs LLM embedding calls inside a request. "Advisory lock per tenant" does not work with session-level locks on the Supabase transaction pooler (verify); use `pg_advisory_xact_lock` or a row/lease in a table. Better: api enqueues a job and waits up to 25 s on its result, so the work stays in the worker. Also confirm the frontend axios timeout (`AIBrain.tsx:190`, `POST /sheets/{action}` with no body) exceeds the budget.
4. **Customer media vs the frontend.** `Conversations.tsx:266-300` puts `msg.media_url` straight into `<img src>` and `<audio src>` (no auth header possible). Section 10 says "short-lived signed URL" but never says `GET` messages must mint the URL at read time, with a TTL long enough for an open tab and for audio seek. Owner decision 1 only covers catalog photos; customer images and voice need the same explicit statement (H-09 "Frontend change? Yes" is avoided only if URLs are minted in the existing response field).
5. **`/sessions` has an undefined state.** `DELETE` sets the number `paused`, but the status mapping has no row for `paused`, and nothing can resume it. Dashboard.tsx:26-31 lets any user click Disconnect; one click silently stops the business with no self-service way back (POST is a no-op when a number exists). Define the returned status for `paused`, who resumes (team task?), and make the Dashboard confirm text ("scan a new QR", line 26) part of the flagged wording issue.

## Unverified or unmarked claims
- Worker and PostgresSaver on a Supabase "direct" connection: direct is IPv6-only on Supabase unless the IPv4 add-on is bought; Fargate in private subnets exits through an IPv4 NAT. Likely use the session-mode pooler. Mark **verify**. Also add a connection budget (2 api + 2 worker pools + checkpointer vs plan limits).
- Webhook "insert-only" but section 5 updates `conversations.last_inbound_at` in the same transaction; that needs contact and conversation get-or-create inline (H-12 unique constraint). Say so, or move to the first worker step and keep a separate `received_at` on the inbound row for the window.
- Supabase JWT verification (HS256 secret vs JWKS) not stated (verify).
- "App Runner cannot run an HTTP-less worker" is fine; the "status uncertain" part is already marked verify.

## Races and tenant checks
| Check | Status |
|---|---|
| Duplicate webhook | Covered (unique key) |
| Tick on every worker | Covered (`ON CONFLICT`) |
| Worker dies in `sending` and lease expires | Not stated in section 3. Reclaimed send job must read the outbox state and reconcile, never re-send (R6, ADR 0003). Add explicitly |
| Burst of 3 customer messages | One job per conversation but 3 sequential runs, 3 replies. Add debounce or batch-latest-messages rule |
| Review item approved hours later | Window may have closed and the draft may be stale after new inbound. Approval must re-run `choose_send_mode` and warn if newer customer messages exist |
| Checkpointer tables (no RLS) | Mitigated by grants; add a probe that the api role cannot read them |
| Per-tenant concurrency cap | Needs a count query; state how it is made race-free |

## Unmet audit items (gap register)
M-04 prompt injection (static system prompt, schema-validate output), M-10 Marathi/Hindi, M-24 audit log (only via ADR 0002), H-36 offboarding/erasure/retention (no job listed in section 3 maintenance), H-31/M-05 retrieval (ModelGateway has no `embed`; no vector or hybrid search or embedding-version column in ports), H-35/L-14 privacy page (frontend change, not in owner list). Either add rows to section 12 Deferred with a target doc, or cover them.

## Scope and realism
- Heavy for a pilot with no live tenant: 7 Terraform modules, 2 envs with separate VPCs, WAF, Object Lock, quarterly restore drills, Langfuse, 4+ always-on tasks. Define a cut line: pilot = one env plus a staging that is destroyed when idle; the rest after pilot.
- Section 11 "onboarding task for the Vyavsay team" has no notification path or owner (Notifier port exists but is not specified).
- Provider F3 text proposes Meta Cloud API, which the owner replaced; correctly framed as owner decision 2. Fine.

## Missing tests (add a Testing section)
Cross-tenant probes for api, worker, system functions, storage URLs; two-worker claim and lease-expiry; kill-worker-mid-send; duplicate webhook; fake-clock window, quiet hours, IST day edge; fault injection (ChatSyncs 5xx, LLM down, Google 429); contract tests for `/sessions` states, error envelope, `totalMessages`; floor-price and prompt-injection eval cases.

## Contradictions with earlier docs
- R4 vs ADR 0002 (blocker 1).
- ADR 0010 and section 10 on media vs PRD FR-21 are consistent, but neither states read-time minting (blocker 4).
- No contradiction with 04-owner-decisions.

## Verdict
revise. Fix blockers 1-5, mark the unverified claims, add the Testing section.
