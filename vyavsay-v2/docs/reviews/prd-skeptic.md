# Skeptic review: docs/01-prd.md

**Summary**
1. Verdict: revise. PRD is solid and well mapped to the gap register, but has 5 blockers.
2. Main holes: unmet gap-register items (M-08, M-10, M-14, M-24, L-14/15), Sheets per-tenant config with no UI, voice-notes vs frontend, and untested multi-instance claims.
3. No owner decision is contradicted. VoiceCalls stub is consistent with ADR 0001.
4. Several targets are unrealistic or inconsistent (latency, p95 vs eval, metrics).
5. Only one ADR exists; several new decisions are not recorded.

## Blockers
1. **Sheets per business has no config path.** Frontend `POST /sheets/{action}` sends no body and no sheet id; grep of `frontend/src` finds no sheet id input. Old bug H-30 was one global `GOOGLE_SHEET_ID`. PRD lists FR-19 but not where each tenant's sheet id and Google credentials live, nor who sets them. Add: admin-set per-tenant sheet config, same OAuth/service-account model as Calendar, and a tenant-scoped sync job. Also note Sheets and Calendar both need Google auth, so decision 3 should cover both.
2. **Gap register items silently dropped or only half-mapped.** Not in any FR/NFR: M-08 (non-transactional writes, double-booking, needs slot uniqueness constraint), M-12 (RAG stale chunks), M-24 (audit log), M-19 (PII in logs; NFR-8/10 omit redaction), M-23 (PII to LLMs, DPAs, zero-retention), H-12 (unique conversation/lead per customer), M-10 (Marathi/Hindi; target users), M-14 (media size caps, unsupported-type reply), M-29/L-17 (hours resolver, away message; FR-17 stores hours but nothing uses them for replies), M-04 (prompt injection), L-14/L-15 (DPDP terms, walk-in notice; these need a frontend change, so they must be listed under owner decision or explicitly deferred), H-11 (storage backup, only DB PITR mentioned). Either add FRs or add an explicit "deferred" table with reasons.
3. **No auth/RLS design for the backend DB access path.** FR-1/FR-2 say RLS plus JWT, but the worker, follow-up runner, ChatSyncs webhook and Sheets job have no user JWT. If they use service role, RLS is bypassed (same as H-01). PRD must state: user-scoped client for API; a restricted worker role with tenant id set per job, plus a CI probe covering worker code paths, not just API. Also `/owner/overview` cross-tenant access needs an explicit platform-admin role and audit log (M-02, M-24); `VITE_OWNER_EMAILS` is client-side only gating.
4. **Voice-note and 24h-window facts depend on unverified ChatSyncs behaviour.** FR-5, FR-11, FR-12, FR-13 assume ChatSyncs gives inbound media, delivery statuses, template send and a 24h window. Unconfirmed (SKILL.md section 8 open). Open question 6 only lists "blocks FR-3 and FR-4"; it also blocks FR-5, 11, 12, 13, 16-reminders. If ChatSyncs is an unofficial/QR-style gateway, template rules may not apply at all. State this and add a go/no-go spike as Milestone 0.
5. **Frontend contract claims unverified or wrong.** (a) "about 45 routes" vs 59 `client.*` call sites; inventory not verified per route (PRD admits this). (b) Contract tests are said to gate release but no route has recorded shapes yet; make "record shapes from `frontend/src`" an exit criterion of the PRD, not a risk. (c) No unread/escalated state in the UI: FR-15 owner notification path is undefined (WhatsApp to owner? that is itself a 24h-window send, and depends on item 4). (d) `PATCH /users/{id}` accepts arbitrary keys; PRD needs a column allow-list (mass-assignment, e.g. plan/status/role fields must not be client-writable; see M-02).

## Wrong or shaky claims
- NFR-1 "p95 under 15 s" vs metric "first response p95 under 30 s" vs audit M-26 "5s target": three different numbers. Pick one.
- Success metric "ungrounded replies under 1%" and "0 floor reveals" on an eval set with no size defined. State minimum eval set size (e.g. 200 cases incl. Hinglish and adversarial) or the 0 is meaningless.
- "Leads reaching booked visit +20% vs manual": no baseline exists, no live tenants. Remove or mark post-pilot.
- NFR-3 99.5% with a single instance on one host; and NFR-11 says N instances. Inconsistent unless the deploy target (AWS, ECS or EC2) is stated. Compute hosting is not decided anywhere; add to owner decisions.
- NFR-5 RPO 1 h with PITR is fine, but Supabase PITR availability depends on plan (already flagged verify). Storage buckets have no backup (H-11).
- "Admin-assisted onboarding, no new screen" (decision 10) plus Calendar OAuth: OAuth needs the business's Google consent, a browser redirect. Admin-assisted means the team logs in as the business or uses a link; that needs a callback route and an unauthenticated state-signed flow. Not spelled out; token refresh/expiry handling missing.
- FR-14 "DB lock" is vague. Specify `SELECT ... FOR UPDATE SKIP LOCKED` or a lease with expiry, plus idempotent send (key on schedule row + attempt) so a crash after send does not resend. Same for FR-3 (claim row with lease) and FR-18 (usage counter increments must be atomic, otherwise limits race across instances).
- FR-13 STOP detection: Hindi/Hinglish stop words not mentioned; opt-in source for first contact (customer-initiated is fine, outbound templates need prior opt-in) not defined.
- FR-12 "all statuses stored": ChatSyncs may not emit read/delivered. Mark "if provided".
- FR-22 / H-36 offboarding listed S; privacy page text fix (NFR-10) needs a frontend change (PrivacyPage.tsx), contradicts "no frontend change". Flag it.
- Risk table says model gateway fallback; free-tier keys risk: also add Groq/Gemini/Jina are the old vendors; PRD does not state which providers v2 uses (HANDOFF says LiteLLM). Embedding model change forces re-embed; no embeddings model/version column requirement (M-05).
- Voice-note STT: not Sarvam, no vendor; cost and Hinglish accuracy unknown. NFR-1 15 s may not hold with transcription. Add STT latency budget.

## Multi-tenant and multi-instance checks
| Check | Status |
|---|---|
| Tenant from JWT only | Covered (FR-1) |
| Worker/cron/webhook tenancy | Missing (blocker 3) |
| Phone number unique across tenants (FR-4) | Add a DB UNIQUE on connected number, else two tenants can claim one |
| Same customer phone in two tenants | Customer identity must be (tenant, contact) composite; M-01, M-13 not mentioned |
| Cache or embedding index shared across tenants | Not addressed; vector search must filter by tenant inside the query |
| Idempotent inbound, outbound, follow-up send | Inbound only; outbound/follow-up missing |
| Usage limits race | Missing (atomic ledger) |
| Sheets and storage paths per tenant | Missing |

## Scope creep / unrealistic
- 23 FRs, 18 of them M, for a v1 with no live tenant. Calendar (FR-16), plan tiers (FR-18) and Sheets (FR-19) could slip behind a "pilot-ready" cut line. Roadmap order exists only in Risks; define a cut line.
- "Second business type config-ready" in out-of-scope list is contradictory (adds work). Remove or define.
- Success metrics (10 rows) need instrumentation not in any FR (takeover rate, review SLA).

## Missing tests (add to NFR-9)
- Cross-tenant probe for API, worker, storage URLs, and vector search.
- Concurrency tests: duplicate webhook, two instances claiming one follow-up, limit race.
- Fake-clock tests for 24h window, quiet hours, IST day boundaries (H-19, M-28).
- Fault injection: LLM down, retrieval down, ChatSyncs 5xx (FR-9, FR-10).
- Contract tests incl. error envelope `{error}` (L-10), sender `business_owner` (M-27), `totalMessages` (H-02), `GET /users` create-on-read (L-11).
- Prompt-injection and floor-price adversarial eval cases.

## ADRs
Only 0001 exists. These PRD decisions need ADRs: tenancy/RLS and worker DB role, durable inbox and job claiming, review-queue approval UX once chosen, compute and hosting, STT vendor, model gateway (LiteLLM) and fallback policy.

## Consistency with owner decisions
No contradictions found. Note: decision 8 (outbound limits deferred) fits the `/vapi/calls/outbound` 403/501 stub; keep stub from ever calling out.

## Needs owner decision (additions)
1. Compute/hosting target and region (affects NFR-3/11).
2. Where Sheets id and Google creds are set per business.
3. Privacy page and DPDP text: accept one named frontend exception, or defer.
4. Scope cut line for v1 pilot.

## Risks
| Risk | Impact |
|---|---|
| ChatSyncs capability unknown | Invalidates FR-3, 5, 11, 12, 13 |
| Service-role use in workers | Reintroduces H-01 |
| Inventory of routes from client code only | Contract drift |
