# Owner decisions (from the audit questions)

Answered 2026-10-07. These drive the rebuild plan.

**Summary**
1. Full rebuild in Python/FastAPI. Old Node code is reference only.
2. Clean database from scratch. No live data or customers to migrate.
3. ChatSyncs replaces direct Meta for WhatsApp.
4. v1 has voice notes (no phone calls), the 24h rule with follow-ups, review queue, Calendar booking.
5. Frontend stays as-is. Exceptions only for real design flaws.

| # | Question | Decision |
|---|---|---|
| 1 | Rewrite or harden? | Rebuild everything in Python/FastAPI |
| 2 | Live DB as source of truth? | No. Fresh schema, no data migration |
| 3 | Hosting and ownership | AWS account is the owner's. Audit item C-02 was a false alarm. Domain/DNS owner still to confirm |
| 4 | Secrets rotated? | Yes, all rotated. Repo is private |
| 5 | WhatsApp provider | ChatSyncs replaces Meta. Still blocked on their inbound-webhook answer |
| 6 | Live tenants and pilot | None live. Pilot name open (Girija Motors or Giriraj) |
| 7 | Voice scope | Voice notes only. Phone calls (Vapi, Plivo, Android sync) parked |
| 8 | Outbound call limits | Deferred. Old open-dialer endpoint is not rebuilt |
| 9 | 24h window and follow-ups | Both in v1 |
| 10 | Persona, tone, hours, max discount | Stored per business in the DB. Set by the team at onboarding. No new screen |
| 11 | `USE_AGENT_GRAPH` flag | Moot. New Python LangGraph agent replaces both old paths |
| 12 | Billing | Plan tiers and usage limits in the app. No payments. Prices still to fix |
| 13 | Instances and crons | Must be persistent and safe with many instances (follow-ups are in v1) |
| 14 | Sheets and time zone | Sheets per business. IST only, keep timezone in the data model |
| 15 | Extra features | Human-review queue and Google Calendar in v1. Sarvam STT not in v1 |

## Still open
- Review queue: how the owner approves held replies (Conversations page, WhatsApp, or a new screen). Decide in agent design.
- **Frontend gaps to resolve in design:** the frontend has no Google connect flow for Calendar and no approval screen. Either use admin-assisted setup or approve a small, named frontend exception.
- ChatSyncs: inbound webhook, multi-tenant model, pricing, limits (see `SKILL.md` section 8).
- Domain and DNS owner. Pilot customer name. Plan prices.

## Updates after owner Q&A (2026-10-07)
Final unless evidence says wrong. Details: ADRs [0025](../../vyavsay-v2/docs/adr/0025-hold-and-escalate.md), [0026](../../vyavsay-v2/docs/adr/0026-calendar-via-calcom.md), [0027](../../vyavsay-v2/docs/adr/0027-langfuse-cloud-backups-chatsyncs-wait.md) in `vyavsay-v2/docs/adr/`.

| # | Decision |
|---|---|
| D1 | The AI never goes silent. When unsure or when the guard holds a draft it sends a short safe holding reply and escalates to the owner. Reverses the "agent stays silent" rule in ADR 0020. |
| D2 | Owner alerts on all three channels: email, WhatsApp to the owner's number, and a "Needs you" flag in the Conversations page (response shaping, no frontend change). |
| D3 | Owner answers by typing the reply in the Conversations page. No Approve button, no frontend change. The AI draft is shown in the email and WhatsApp alert. AI resumes after the owner replies or resolves. |
| D4 | Reminders to the owner at 30 min and 2 h. At 4 h (business hours) the AI tells the customer politely that the team will reply soon. The chat stays open for the owner. |
| D5 | Calendar is Cal.com (free, open source), replacing Google Calendar in v1 scope (replaces ADR 0021 and the calendar part of 0006). Cloud vs self-host, per-tenant keys, attendee email, free-tier limits: to verify in a spike. |
| D6 | Langfuse Cloud with masking of names and phone numbers (not self-host). |
| D7 | Backups: Supabase paid point-in-time recovery plus a daily copy to the owner's AWS S3. |
| D8 | Wait for ChatSyncs. No direct-Meta fallback for now (reverses fallback F3 in ADR 0008). Build against the `WhatsAppProvider` interface with a fake provider. Documented: Incoming Message webhook, four triggers, Webhook Workflow for sending, Meta-hosted number and templates, one Full-access partner per WABA. Still unknown: webhook auth, retries, voice and image payloads, multi-tenant model, exact send API, pricing and limits. |

Still open after this update: ChatSyncs answers, Cal.com cloud vs self-host, holding-reply and 4 h notice wording, `owner_alert` template copy, Langfuse region, domain and DNS owner, pilot customer, plan prices.

## Updates after ChatSyncs research (2026-10-08)
Final unless evidence says wrong. All ChatSyncs facts are "from public docs, unverified in practice". Details: [ADR 0029](../../vyavsay-v2/docs/adr/0029-pilot-chatsyncs-decisions.md); questions tracker: `vyavsay-v2/docs/chatsyncs-open-questions.md`.

| # | Decision |
|---|---|
| D9 | Secret in the URL path is the only inbound auth for the pilot, accepted only if ChatSyncs confirms it has no signing secret or fixed IPs. Public docs show neither (IP page says "coming soon"). Owner signs a short risk note. We keep asking and add signing when it exists. |
| D10 | Pilot is text only. Inbound voice and images are stored as unsupported, the customer is asked politely to type, the owner is alerted. v1 "done" means voice off. Voice-minute limits stay out of the pilot tier until a real media sample exists. |
| D11 | One ChatSyncs account and API key per business. No shared key. (The key is account-wide with full access, so a shared key would expose every business.) Budget one ChatSyncs plan per business. |
| D12 | The catch-up poller is built in v1 now, not conditionally. Cheap: rate-limited, per account, uses `get-conversation`, dedupes by `wa_message_id`. Retries and replay are undocumented. |
| D13 | Coexistence (owner keeps the phone app) is allowed for pilot numbers. The first spike tests whether phone-typed messages reach us. Until answered they are stored and ignored. Note the 20 messages per second cap under coexistence. |
| D14 | Open ChatSyncs questions live in `docs/chatsyncs-open-questions.md` and are clarified from public docs and web search first. No support email for now; a support contact stays an optional later step. |
| D15 | The Vyavsay team rotates webhook URLs and secrets by hand at a quiet hour, using the rotation runbook and a checklist. |

Needs the owner: sign the D9 risk note once the spike confirms no signing or IPs; confirm one ChatSyncs plan per business is in budget (Starter or higher; Lite may lack webhooks).

## Updates after execution kickoff (2026-10-08)
| # | Decision |
|---|---|
| D16 | One developer plus Claude builds. No deadline: deliver as fast as quality allows, work milestone by milestone, no date planning. |
| D17 | The existing Supabase project is the old app's database. It is NOT used for v2. v2 gets a new project (created by the owner in the dashboard; keys never pasted in chat). Dev and CI use local Postgres first. |
| D18 | Hosting moves from AWS to the owner's new Oracle server. Shape deferred. See [ADR 0030](../../vyavsay-v2/docs/adr/0030-hosting-oracle-pending.md). AWS-specific parts of ADR 0007/0010 and D7 (S3 copy) are re-checked when the shape is known. |
| D19 | Stop over-planning: remaining owner questions (wording, templates, Cal.com hosting, Langfuse region, prices, domain, pilot, legal text) wait until each milestone needs them. |
| D20 | Owner decision 2026-10-08: build the migration plans for the agent and the backend first and prove that they sync (seam suite plus eval gate) before any DB or infra work. DB and infra stay parked (D17, D18) until the plans are executed on fakes (roadmap block M1c). Plans: `vyavsay-v2/docs/07-backend-migration-plan.md`, `08-agent-migration-plan.md`, `09-agent-backend-sync-contract.md`. |

## Update 2026-10-09: two developers, lean start
| # | Decision |
|---|---|
| D21 | Two developers plus Claude (replaces D16). Split by seam: Dev A backend and platform, Dev B agent. Plans are reference; build from `vyavsay-v2/docs/START-HERE.md`. First milestone is "slice 0" on fakes; DB and infra after it. |
