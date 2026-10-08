# Vyavsay Assist

A WhatsApp AI sales assistant for small businesses. First industry: used-car dealers. A customer messages the dealer's WhatsApp number; the assistant answers from the dealer's own stock, books test drives, follows up, and hands the chat to the owner when it is unsure.

> **This repo is public.** Never commit secrets, API keys, customer data or real phone numbers. Use `.env` files (git-ignored) and `.env.example` for names only.

## Start here (read in this order)
1. This README (10 minutes).
2. [`vyavsay-v2/docs/START-HERE.md`](vyavsay-v2/docs/START-HERE.md): who owns which folder and where the two of us meet.
3. [`vyavsay-v2/docs/BACKLOG.md`](vyavsay-v2/docs/BACKLOG.md): your list of work items. Pick the first one with no unmet dependency.
4. The reference doc for your track (table in section 5). Open reference docs only when your task touches that area; most of them are long.

## 1. What is going on (the migration, in two minutes)
- **There was an old app** (Node/TypeScript, Fastify) in `backend/`. A full audit found 211 problems. The worst: no tenant isolation in the database, an open outbound dialer, AI replies that were never checked (invented warranties, the floor price leaked to customers), webhooks that fail open, and a schema that cannot be recreated.
- **Decision (owner, 2026-10-07): rebuild everything in Python/FastAPI** in `vyavsay-v2/`. The old code is a read-only reference. Do not edit it and do not import from it.
- **"Migration" here means porting behaviour, not data.** There are no live customers, so the database starts fresh. What we carry over is what the old app did (routes, rules, prompts, flows), fixed where the audit found bugs.
- **The frontend is reused as-is** (`frontend/`, React). Its API contract is fixed: same routes, same response shapes. We build the backend to match it. A frontend change needs evidence of a real design flaw and the owner's approval.
- **The AI agent is rebuilt** with LangGraph (Python). It replaces both old AI paths. It never sends anything or writes anything: it proposes a reply and the backend applies it after re-checking.
- **WhatsApp goes through ChatSyncs** (a provider on top of Meta's Cloud API), hidden behind our own interface so we can swap providers without a refactor. Several ChatSyncs behaviours are still unverified: see `vyavsay-v2/docs/chatsyncs-open-questions.md`.
- **Pilot scope (v1):** text messages only (voice notes are off), the 24-hour WhatsApp window with template fallback, automatic follow-ups, hold-and-escalate to the owner, plan limits (no payments), IST only.

### Hold-and-escalate (the behaviour you will hear about most)
When the AI is unsure or its draft fails a safety check, it does **not** go silent. It sends a short, pre-approved holding message ("I will confirm and let you know"), alerts the owner (email, WhatsApp, and a "Needs you" flag in the Conversations page), reminds the owner at 30 minutes and 2 hours, and after 4 business hours tells the customer politely that the team will reply. The owner answers by typing in the Conversations page. Details: `vyavsay-v2/docs/adr/0025-hold-and-escalate.md`.

## 2. Repo map
| Path | What it is | Edit? |
|---|---|---|
| `vyavsay-v2/` | The rebuild (Python 3.12, FastAPI, LangGraph). All new work goes here. | Yes |
| `frontend/` | The existing React app, reused unchanged. | No (flag a flaw and ask) |
| `backend/` | The old Node app. Reference only. | No |
| `docs/production-plan/` | The audit (211 findings), the old architecture and flows, and the owner decisions. | Only to record owner decisions |
| `CLAUDE.md`, `SKILL.md` | Instructions for AI coding assistants; `SKILL.md` is the ChatSyncs API guide (written for Node, adapt to Python). | Rarely |

Inside `vyavsay-v2/`: `app/api` (HTTP routes), `app/core` (business rules), `app/jobs` (background work), `app/agent` (the agent), `app/ports` (interfaces), `app/adapters` (WhatsApp providers and other outside services), `app/bootstrap` (wiring), `tests/`, `migrations/` (SQL, empty for now), `prompts/`, `docs/`.

## 3. Who does what
We are two developers. The split follows one interface, the **seam**.

```
 customer ── WhatsApp ── provider ──► webhook ──► ingest ──► ┌──────────────┐
                                                             │  Dev A       │  holds state, does side effects
 Dev A: backend and platform                                 │  backend     │
   API · jobs · data layer · auth · sends                    └──────┬───────┘
                                                                    │  RunInput ──►            ◄── ProposedReply / ReviewRequest / NoReply
 ─────────────────────────────  the seam: app/ports/agent.py, agent_reads.py  ─────────────────────────────
                                                                    │
 Dev B: agent                                                ┌──────▼───────┐
   graph · guard · prompts · evals · model gateway           │  Dev B       │  decides what to say, never writes or sends
                                                             │  agent       │
                                                             └──────────────┘
```

| | Dev A: backend and platform | Dev B: agent |
|---|---|---|
| Owns | `app/api`, `app/core` (except the guard), `app/jobs`, `app/bootstrap`, `app/adapters`, the data layer, auth, `migrations/`, frontend contract tests, CI, hosting | `app/agent`, the model gateway, the reply guard, `prompts/`, `evals/`, tracing |
| Builds against | `ScriptedAgent` (a fake agent that replays fixed answers) | In-memory read ports (a fake backend that serves catalog and knowledge) |
| Hands the other | read-port implementations, the post-step that applies outcomes, the prompt store | an `AgentRunner`, the pure `guard(...)` function, the `embed(...)` function |

Rules of the split:
- Inside your own area: decide, build, merge.
- Anything in `app/ports/agent.py` or `app/ports/agent_reads.py` (the seam): both approve, additive changes only, bump `AGENT_CONTRACT_VERSION`.
- Schema and migrations belong to Dev A; Dev B asks in a PR comment.
- Every PR is reviewed by the other developer.

| Developer | GitHub | Track |
|---|---|---|
| | | A or B (write it here) |
| | | A or B (write it here) |

## 4. Set up and run
Requirements: `git`, [`uv`](https://docs.astral.sh/uv/) (installs Python 3.12 for you), and Postgres 17 with the `pgvector` extension for the database tests.

```bash
git clone https://github.com/developer1-cybersmith/temp.git
cd temp/vyavsay-v2
uv sync                       # creates .venv with Python 3.12 and locked dependencies
```

Postgres for tests (pick one):
```bash
# macOS
brew install postgresql@17 pgvector && brew services start postgresql@17
# any OS with Docker
docker run -d --name vyavsay-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg17
export VYAVSAY_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```
The test harness creates throwaway databases and drops the project's database roles cluster-wide, so use a dedicated local Postgres, never a shared one. Without the variable it connects to the local socket as your OS user (must be a superuser).

Run the checks (do this before every PR):
```bash
uv run ruff check . && uv run mypy app && uv run lint-imports && uv run pytest --ignore=tests/rls
uv run pytest tests/rls       # row-level-security suite: RED ON PURPOSE until the schema exists
uv run uvicorn app.main:app --reload    # run the API (only /health exists so far)
```
**What red means:** `tests/rls` has about 157 failing tests that say `schema missing: app.tenants ...`. They were written first, as the checklist for the tenant-isolation schema. CI treats that suite as expected-red; it must not block other work. Anything else failing is a real failure.

## 5. Where things are (reference docs, all under `vyavsay-v2/docs/`)
| Need | Read |
|---|---|
| The product and v1 requirements | `01-prd.md` |
| Overall architecture, background jobs, WhatsApp window rules | `02-architecture.md` |
| Tenancy, data model, row-level security | `03-tenancy-data.md` (Dev A) |
| Agent graph, guard, hold-and-escalate, evals | `04-agent-design.md` (Dev B) |
| Swapping WhatsApp providers | `06-provider-portability.md` (Dev A) |
| What the old backend does, route by route, and how each piece is ported | `07-backend-migration-plan.md`, `parity/backend-parity-ledger.md`, `reviews/legacy-inventory-backend.md` (Dev A) |
| What the old AI did, and how each piece is ported (prompts, RAG, tools) | `08-agent-migration-plan.md`, `reviews/legacy-inventory-agent.md` (Dev B) |
| The exact agent-backend interface and the tests that keep them in sync | `09-agent-backend-sync-contract.md` (both) |
| Why we decided things | `adr/` (ADRs; status "Proposed" means not yet challenged in practice) |
| Open ChatSyncs questions | `chatsyncs-open-questions.md` |
| Owner decisions (D1 to D21) | `../docs/production-plan/04-owner-decisions.md` |

## 6. How we work
- **Tests first.** The failing test is part of the PR. Then the code.
- **The agent only proposes; the backend applies.** Import-lint enforces it (`app/agent` cannot import `adapters`, `api` or `jobs`; core cannot import adapters).
- **Fakes first.** Build against `FakeProvider`, `ScriptedAgent` and in-memory repositories. The database, hosting and the real ChatSyncs hookup plug in later.
- **Small PRs into `main`.** Gates green. The other developer reviews. Seam files need an explicit approval.
- **ADRs** only for decisions that are hard to undo. Use the next free number in `docs/adr/`.
- **Don't guess version-sensitive APIs** (LangGraph, Supabase, ChatSyncs). The docs mark them "verify". Check the current docs before coding.
- **AI coding assistants:** start Claude Code from `vyavsay-v2/` so it loads `AGENTS.md` (the short rule list). Plugins are listed in `vyavsay-v2/docs/SKILLS.md` and are optional.

## 7. Current state
| Area | State |
|---|---|
| Project skeleton, CI, import rules | Done |
| Seam v0 (`app/ports/agent.py`, `agent_reads.py`) and `ScriptedAgent` | Done, tested |
| WhatsApp provider interface, canonical models, `FakeProvider`, adapter conformance tests | Done, tested |
| Row-level-security test suite | Written, red until the schema exists |
| Everything else (routes, jobs, graph, guard, data layer) | Not started; see `BACKLOG.md` |

**First goal, "slice 0":** a customer text on the fake provider gets a guarded reply; an unsure reply gets a holding message and an owner alert, all running on fakes with no database.

## 8. Still open (owner)
ChatSyncs test number and answers (webhook auth, retries, media), the two developers' GitHub handles for code ownership, the Hinglish/Marathi evaluator, AI-disclosure wording, template and holding-reply wording, hosting shape (Oracle, see ADR 0030), domain, pilot customer, plan prices. Each has a default in the docs; take the default and move on unless it blocks you.

## Glossary
- **Tenant:** one business (a dealership). All data is isolated per tenant.
- **RLS:** row-level security in Postgres, so one tenant can never read another's rows.
- **Seam:** the typed interface between the agent and the backend.
- **Port / adapter:** an interface in `app/ports`, and a concrete implementation in `app/adapters` (for example a WhatsApp provider).
- **Outbox:** a table of messages to send, written before sending, with an idempotency key so a crash never double-sends.
- **24-hour window:** WhatsApp only allows free-form replies within 24 hours of the customer's last message; after that only pre-approved templates.
- **Guard:** a pure function that checks a draft reply (no floor-price leak, discount within limit, no invented claims) before anything is sent.
- **Hold-and-escalate:** see section 1.
- **Slice 0:** the first end-to-end milestone, on fakes.
