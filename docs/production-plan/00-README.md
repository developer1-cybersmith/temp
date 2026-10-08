# Production Audit: README

**Summary**
1. Audited: Vyavsay Assist backend (Fastify/TS), DB migrations, AI/RAG, WhatsApp, Vapi voice, cron, and infra docs. Frontend reused as-is.
2. 211 findings: 2 critical, 80 high, 93 medium, 36 low.
3. Biggest risks: open outbound dialer, no RLS, cross-tenant leaks, fail-open webhooks.
4. AI replies are not grounded or checked, and persona and claims are hardcoded.
5. Not verified: the live Supabase DB, Vapi account caps, repo visibility.

## Counts by severity

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 80 |
| Medium | 93 |
| Low | 36 |

## Top 10 risks

| # | Risk | Sev |
|---|---|---|
| 1 | `/calls/outbound` dials any number: no E.164 check, no cap, no consent. Any signup can use it. | Critical |
| 2 | ~~Prod on a friend's AWS account~~ Resolved: owner confirmed the AWS account is theirs. Still true: no IaC, no rebuild runbook (now Medium). | Resolved |
| 3 | No RLS anywhere. Backend uses the service-role key and the browser ships the anon key. | High |
| 4 | `/api/analytics` counts `wb_messages` across all tenants. The table has no `user_id`. | High |
| 5 | Vapi webhook fails open if the secret is unset. Placeholder secret is in code. | High |
| 6 | Vapi tenant lookup trusts `metadata.userId` and falls back to the first user. | High |
| 7 | WhatsApp webhook falls back to the oldest user. Sends fall back to platform env token. | High |
| 8 | Test password, verify token and AWS/Meta IDs are in committed docs: [REDACTED]. | High |
| 9 | Schema is not reproducible. `wb_calls`, `wb_call_actions` and `ai_paused` have no DDL. Migration 005 is missing. No backups or restore plan. | High |
| 10 | Replies are unchecked. Prompts invent warranty and social proof, and the floor price leaks. Retrieval errors look like "no match". | High |

Also high: WABA tokens stored as plaintext, duplicate conversations from check-then-insert, lost webhook events, no WhatsApp templates or 24h window, no evals.

## Frontend contract

The new backend must keep these:
- Same routes and response shapes. Example: `/api/analytics`. Fixes need no frontend change.
- Supabase auth with the anon key (`VITE_SUPABASE_ANON_KEY`). RLS must not break the screens the browser uses.
- The `/sessions` contract, which QRScanner, Settings reset and Dashboard status call. It is dead today, so a compatibility endpoint is needed.
- One lead-stage vocabulary. Which one the Leads page sends is unconfirmed.

True frontend flaws: only the dead `/sessions` screens are confirmed so far. See 01-03 for details.

## Solid and keepable

- Docker and docker-compose files.
- Fastify app with auth plugin and a public-route list.
- Existing schema design (001-004, 006-011), once a live baseline is exported.
- Domain router and per-vertical prompt structure.
- Embedding provider swap to Groq, Gemini and Jina, which fixed the silent outage.
- `wb_waba_accounts` and `wh_message_id` unique design for webhooks.

## Questions for the owner (ranked)

1. Rewrite (FastAPI/LangGraph) or harden the Fastify/TS backend? Which is the system of record?
2. Is the live Supabase schema the source of truth? Can it be exported? Is RLS on?
3. ~~Will you move prod into an AWS account you own?~~ Answered: AWS account is the owner's. Domain and DNS owner still to confirm.
4. Have the test password, verify token and AWS/Meta IDs been rotated? Is the repo public?
5. Is Cloud API final? Is ChatSyncs a replacement for direct Meta (it contradicts PROJECT_HANDOFF.md:179)?
6. How many tenants are live? Who is the pilot, Giriraj or Girija Motors?
7. Is Vapi voice, Plivo or the Android call-sync app in scope or parked?
8. Should outbound calls need a paid plan, consent and a daily cap?
9. Is the missing 24h window and template support known? Are cron follow-ups needed now?
10. Should per-tenant persona, tone, hours and max discount be built?
11. Should `USE_AGENT_GRAPH` go live or be removed? GENAI_POC_PRD.md is missing.
12. Billing: Rs1,499/4,999/14,999 vs Rs2,499 vs none in v1. Is Razorpay needed before 5 paying showrooms?
13. How many backend instances run? Crons need a lock if more than 1. Should reminders survive restarts?
14. Is Sheets sync global or per-tenant? Should the timezone be per-tenant (IST only today)?
15. Are Sarvam STT, Google Calendar booking and a human-review queue in scope? No code exists.

Smaller open items (lead stages, daily-report recipient, missed-report catch-up, bookings over 24.8 days out) are in 01-03.

## Links

- Findings: [01 gap register](./01-gap-register.md), [02 architecture](./02-architecture-as-is.md), [03 flows](./03-flows.md), [04 owner decisions](./04-owner-decisions.md)
- Decisions: [adr/](./adr/)

## Next documents

- [ ] Target architecture
- [ ] Tenancy design (RLS, tenant keys, secrets)
- [ ] Agent design (grounding, persona config, eval plan)
- [ ] Roadmap (critical fixes first, then high)
