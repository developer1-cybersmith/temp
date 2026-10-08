<!-- bmad:context -->
<!-- Verified 2026-10-09 against 72398de (plus provider-portability docs 0028, revised after skeptic review, and a ChatSyncs docs review, rounds 1 and 2, unverified in practice). Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## Vyavsay Assist v2

WhatsApp AI sales copilot for small businesses (first vertical: used cars). Python/FastAPI, LangGraph agent, Supabase/Postgres, ChatSyncs for WhatsApp. Code is in progress (skeleton, seam v0, fake provider, red RLS suite); the planning docs are `docs/01-prd.md` to `docs/05-roadmap.md`, decisions in `docs/adr/`, audit in `../docs/production-plan/`.

## Policy

- Never edit `../backend` or `../frontend`; read only. The frontend API contract is fixed. Need a change? Flag it with evidence and ask first.
- Never import code across `../backend` and this folder.
- Never print or commit secrets. Tenant secrets live encrypted in the DB (`docs/adr/0010-config-secrets-media.md`), never in env files or prompts.
- Record each design decision as an ADR in `docs/adr/` (next free number).
- Write tests first: contract tests against the frontend API, an agent eval set, and cross-tenant RLS probes.
- Owner decisions in `../docs/production-plan/04-owner-decisions.md` stand. Reopen one only with evidence.

## Where things are

- Agent design: `docs/04-agent-design.md`. Tenancy and schema: `docs/03-tenancy-data.md`. Architecture: `docs/02-architecture.md`. Stories: `docs/05-roadmap-stories.md`.
- Skeptic reviews: `docs/reviews/`. Skills in use: `docs/SKILLS.md`; keep it updated when skills change.
- ChatSyncs guide (Node-oriented, adapt to Python): `../SKILL.md`. Open ChatSyncs questions tracker: `docs/chatsyncs-open-questions.md`.

## Running and verifying

- From `vyavsay-v2/`: `uv sync`, then `uv run ruff check . && uv run mypy app && uv run lint-imports && uv run pytest --ignore=tests/rls`. Python is pinned to 3.12 by `uv`.
- `tests/rls` is red on purpose (written first, waiting for the schema); CI treats it as non-blocking. DB tests need Postgres 17 with pgvector and `VYAVSAY_TEST_DATABASE_URL` pointing at a dedicated local server, because the harness drops project roles cluster-wide.
- Who owns which folder, and the work list: `docs/START-HERE.md`, `docs/BACKLOG.md`.

## Conventions that differ from defaults

- No tenant data access outside `tenant_tx(tenant_id)`. System-tier access goes only through the fixed SECURITY DEFINER list (ADR 0012). Never use the Supabase service-role key at runtime; it is for migrations only.
- Never take tenant, contact or booking ids from model output. They come from run context.
- Agent graph nodes have no side effects. They return a proposed reply; a deterministic post-step writes the outbox or review item.
- Agent tools are read-only or propose-only, run by our own loop with a per-run allowlist. Tool, LLM-call and time caps are enforced in code, not in the prompt (ADR 0018).
- Never put cost or floor price in prompts or agent queries. Only the guard reads `catalog_pricing` (ADR 0019).
- Treat customer text, transcripts and imported catalog text as untrusted: static system prompts, data inside delimited blocks.
- Never import provider code from core: `app/adapters/<provider>/` is imported only by `app/bootstrap/registry.py`. Core uses canonical models only; WhatsApp window, template and opt-out rules live in the core (ADR 0028, `docs/06-provider-portability.md`). Contacts are keyed by `contact_key`, never raw phone; webhook routing uses `endpoint_keys` (key's own provider), not the number's.
- Sends go through the outbox with an idempotency key. Never send directly from a handler or node (ADR 0003).
- Model calls go through the LiteLLM gateway by task name; prompts are versioned DB rows. Never hardcode a model or prompt in code.
- Store time as `timestamptz`, show IST, keep the timezone on the tenant.

## Known pitfalls

- The ADRs are Proposed, and version-sensitive LangGraph/Supabase APIs are marked "verify" (docs were written with MCP docs offline). Check against current docs before coding.
- ChatSyncs (all "from docs, unverified in practice"): inbound text webhook, REST send, templates and status lookup are documented; webhook auth, retries, media and voice payloads, owner-phone echo and rate limits are not. Inbound auth is a path key only: never log webhook URLs (log `key_id`), one key per trigger, rotate by the drain runbook. Sends have no idempotency key (errors are HTTP 200 with `status:"0"`; `status:"1"` without `wa_message_id` is `unknown_send`); status lookup is by `wa_message_id` only; `id_space` is `chatsyncs`, never flipped. v1 "done" is defined with voice off. The catch-up poller needs the go-live cursor, stale-message rule and a passing webhook-id equals history-id fixture test before it runs on a live number; never reply to a polled row older than `poll_max_age`; the reply target comes only from the stored contact. See `docs/02-architecture.md` s4 and `docs/reviews/chatsyncs-webhook-findings.md`.

<!-- /bmad:context -->
