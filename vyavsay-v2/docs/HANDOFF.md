# Handoff: context from the audit chat

Read this first in a new session. Then read `../CLAUDE.md`.

**Summary**
1. Old app (`../backend`, Node/Fastify) was audited: 211 findings. We are doing a full Python/FastAPI rebuild in this folder.
2. Owner answered the audit questions. Decisions are in `../../docs/production-plan/04-owner-decisions.md`.
3. Planning docs 01 to 09 exist. Next step (D20): execute block M1c, the migration plans on fakes, before any DB or infra work.

## Where everything is
| What | Path |
|---|---|
| Audit summary and top risks | `../../docs/production-plan/00-README.md` |
| 211 findings by severity | `../../docs/production-plan/01-gap-register.md` |
| Current architecture and flows | `../../docs/production-plan/02-*.md`, `03-flows.md` |
| 22 inferred decisions (ADRs) | `../../docs/production-plan/adr/` |
| Owner decisions | `../../docs/production-plan/04-owner-decisions.md` |
| ChatSyncs API guide (Node-oriented) | `../../SKILL.md` |
| Skills and why | `SKILLS.md` |
| Backend migration plan (every legacy item, slices A0 to A7, data-layer ports, 30 intentional changes) | `07-backend-migration-plan.md`, ledger `parity/backend-parity-ledger.md` |
| Agent migration plan (prompts as data, behaviour parity, slices S0 to S7, contracts C1 to C16) | `08-agent-migration-plan.md`, seeds `../prompts/README.md` |
| Agent and backend sync contract (typed seam, 48 scenarios, failure modes, plug-in points) | `09-agent-backend-sync-contract.md` |
| Reviews of those plans (skeptic resolutions) | `reviews/07-backend-migration-plan-skeptic.md`, `reviews/09-agent-backend-sync-contract-skeptic.md` |
| Schedule of the migration work (block M1c, before infra) | `05-roadmap.md` s2, `05-roadmap-stories.md` M1c-1 |

## Things not written elsewhere
- Owner wants short, simple replies. Long analysis goes in files.
- Old stack facts: WhatsApp was Meta Cloud API only (Baileys was an unused dependency). AI used Groq (text), Gemini (vision), Jina (embeddings). A LangGraph JS agent existed behind `USE_AGENT_GRAPH`, off by default and pointing at a retired endpoint.
- Audit item C-02 ("prod in a friend's AWS account") was wrong. The AWS account is the owner's.
- Old open outbound-call endpoint is not rebuilt (phone calls are parked).
- Frontend gaps are settled without frontend change (owner Q&A 2026-10-07): calendar is Cal.com set up by the team ([0026](adr/0026-calendar-via-calcom.md)); escalations use a holding reply, three-channel alerts and the owner's reply in the Conversations composer ([0025](adr/0025-hold-and-escalate.md)).
- ChatSyncs: the "Incoming Message" webhook is now documented; send API, templates and the multi-tenant model are now documented (from docs, unverified in practice); webhook auth, retries, voice payloads, owner-phone echo, rate limits and pricing are still unknown (E0.8). Owner decisions D9 to D15 (2026-10-08, [0029](adr/0029-pilot-chatsyncs-decisions.md)): path-key-only inbound auth accepted for the pilot with a signed risk note; text-only pilot (voice off); one ChatSyncs account per business; catch-up poller built in v1; coexistence allowed after a spike (phone-typed messages stored and ignored until then); questions tracked in `chatsyncs-open-questions.md` (no support email yet); manual webhook rotation by the team. No Meta fallback: we wait and build on a fake provider ([0027](adr/0027-langfuse-cloud-backups-chatsyncs-wait.md)).
- Chosen tools: LangGraph (Python) only for the agent flow, not LangChain. Langfuse Cloud for tracing (names and phone numbers masked). A model gateway (LiteLLM) so models swap by config. Prompts as versioned data with per-business overrides.
- Plugins installed here (project scope): Superpowers, BMAD (6.13.0-next, pre-release), context7, LangChain skills, Supabase, Postgres best practices. If they don't show up, run `/reload-plugins` or start a new session from this folder.

## Update 2026-10-08 (D20)
- Owner decision D20: build the migration plans for the agent and backend and prove sync before DB and infra work. DB and infra are parked (D17, D18); start with M1c step 1 (A0 Foundation, tests first, on fakes). "Done" for a story is green on memory (Gm); M2 and M3 close only on green on Postgres (Gp).
- Doc fixes still pending outside 07 to 09 (reported, not edited): PRD FR-5 says no agent run on images and line 131 lists `/voice/extract-walkin` without saying it is a stub in v1 (OD-19, OD-12b); `03-tenancy-data.md` needs gaps G7 to G10 (G8 is `contacts.name_source`, 07 s4f; G7, G9, G10 are in 09 s7); `02-architecture.md` s7 thread id and checkpointer (OD-S9); ADR 0023 third-run wording and ADR 0018 (P3.17); PRD s6 clock start of the 15 s holding bar (OD-S1); `AGENTS.md` still says "fixed list (ADR 0012)" for SECURITY DEFINER (the consolidated list goes in ADR 0031, P0.2). ADR numbers proposed: 0031 data layer, 0032 prompt layering, 0033 parity catalogue, 0034 sync contract (filed by P3.17).

## Still open
- Owner: sign the D9 risk note (E0.9); confirm one ChatSyncs plan per business in budget (D11). Voice stays off until a real media sample exists (D10).
- ChatSyncs answers (tracker: `chatsyncs-open-questions.md`; first spike case is coexistence), Cal.com cloud vs self-host, holding-reply wording and `owner_alert` template copy, Langfuse region, domain/DNS owner, pilot customer, plan prices.

## Suggested next steps
1. Start BMAD planning here. Keep each doc short with a 5-line summary.
2. Write ADRs for each new decision in `adr/`.
3. Have skeptic agents review each design doc before moving on.
