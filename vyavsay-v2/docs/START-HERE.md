# Responsibilities and boundaries (two developers)

**Summary**
1. Everything in `docs/` is reference. This page is the working agreement: who owns what, and where the two meet.
2. Split along the seam. Dev A owns the system that holds state and does side effects. Dev B owns the thinking that produces a proposal.
3. The two meet only at `app/ports/agent.py` and `app/ports/agent_reads.py`. Each side builds against fakes of the other (`ScriptedAgent`, in-memory read ports).
4. Each developer decides inside their area without asking. Anything crossing the seam needs both.
5. Each developer's work list is in [`BACKLOG.md`](BACKLOG.md). The repo `README.md` explains the whole project for a newcomer.

## 1. Ownership by folder
| Area | Dev A: backend and platform | Dev B: agent |
|---|---|---|
| Code | `app/api`, `app/core` (except the guard), `app/jobs`, `app/bootstrap`, `app/adapters/**`, `app/ports/whatsapp*`, `app/ports/phone.py` | `app/agent/**`, `app/llm/` (model gateway), `app/core/rules/guard*` |
| Data | `migrations/`, data-layer ports and repos (memory first, Postgres later), RLS, auth, tenant context | none (reads only through the read ports) |
| Content | holding and owner-alert template text, onboarding config | `prompts/`, `evals/` (golden set, grader, judge) |
| Tests | `tests/db`, `tests/rls`, `tests/conformance`, `tests/contract` (frontend routes), `tests/seam` harness | `tests/agent`, eval runs, guard tests |
| Ops | `.github/workflows`, Docker, Oracle and infra, secrets, backups | Langfuse project and tracing config |
| Docs (reference) | 02, 03, 06, 07, parity ledger | 04, 08, `prompts/README.md` |

**Shared, both must approve a change:** `app/ports/agent.py`, `app/ports/agent_reads.py`, `pyproject.toml` dependency changes (note it in the PR), `docs/09-agent-backend-sync-contract.md`.

## 2. Who does what across the seam
| Feature | Dev B produces | Dev A applies |
|---|---|---|
| Reply to a text | `ProposedReply` (text, claims) | re-runs the guard, picks send mode (24h window, templates), writes the outbox, sends |
| Hold and escalate | `ReviewRequest` with reason codes and a holding reference | resolves the approved holding text, stores the review item, sends the holding reply, owner alerts (email, WhatsApp, flag), reminders at 30 min, 2 h, 4 h |
| Catalog and knowledge | search logic: query building, thresholds, embedding calls | stores items and vectors, implements `CatalogReadPort` and `KnowledgePort`, runs the embed job on catalog write (calls B's embed function) |
| Lead and booking | `LeadProposal`, booking proposals | validates and writes them; the visit-as-task fallback |
| Follow-ups | follow-up reason and content on request (`AgentTasks`) | scheduler, rate and window rules, opt-out checks |
| Prompts | renders prompts from resolved versions | owns the prompt store; serves `PromptStore.resolve` |
| Limits and pause | none; receives `NoReply` reasons | `ai_paused`, opt-out, plan limits, the run gate |
| Trace and usage | emits `TraceEvent`s, tags LLM calls with `run_id` | persists `agent_runs` and usage rows |

## 3. What each side owes the other
| A owes B | B owes A |
|---|---|
| `ContextBundle` loader (in-memory first) | `AgentRunner` (starts as the scripted one, then the graph) |
| Implementations of the read ports | The pure `guard(draft, facts, cfg, now)` function |
| The post-step that applies outcomes | The `embed(texts)` function and model gateway |
| `PromptStore`, holding template store | Eval harness that runs against the seam, not around it |

## 4. Decision rights and review
- Inside your area: decide, build, merge. Write an ADR only if the decision is hard to undo.
- Seam change: both approve, additive only, bump `AGENT_CONTRACT_VERSION`.
- Schema or migration: Dev A. If Dev B needs a column, ask in a PR comment on the seam or the data-layer port.
- Every PR gets a review from the other developer. Seam and shared files need an explicit approval.
- Gates before a PR: `uv run ruff check . && uv run mypy app && uv run lint-imports && uv run pytest`.
- Tests first: the failing test is part of the PR.
- Never edit `../backend` or `../frontend`. The frontend API contract is fixed.

## 5. Not assigned by the original plan: default owner
| Item | Default |
|---|---|
| ChatSyncs spike, adapter and open-questions tracker | Dev A |
| Frontend contract harness and routes | Dev A |
| Eval labeller (Hinglish, Marathi) | Dev B finds, owner names |
| Owner-facing legal and consent text | Owner |
| Cal.com, Sheets, plan tiers | Parked |

## 6. Parked
Extra fake-provider profiles, Meta adapter, Cal.com booking, Sheets, plan tiers, offboarding, voice, most seam scenarios and eval cases (start small), Oracle and infra until slice 0 works.

**Slice 0 (the first goal):** a customer text on the fake provider gets a guarded reply; an unsure reply gets a holding message and an owner alert.
