# Backlog (work items per track)

**Summary**
1. Items are unordered. Pick any item whose "Needs" are done. No dates; finish the first goal (slice 0) before the parked work.
2. Each item names a test that must exist first. Refs point to the long reference docs; open them only for the item you are on.
3. A = backend and platform. B = agent. J = joint. The seam is `app/ports/agent.py` and `app/ports/agent_reads.py`.
4. When an item is done, tick it here in the same PR. Add new items at the bottom of your track.

## Dev A: backend and platform
| ID | Item | Needs | Test first | Refs |
|---|---|---|---|---|
| A1 | App wiring: settings (pydantic-settings), app factory, `bootstrap` container that picks fake adapters | none | app boots with fakes; no adapter import outside `bootstrap/registry.py` | 07 s3 |
| A2 | Data-layer ports and in-memory repos: tenants, config, contacts, conversations, messages, inbound events, outbox, jobs, review items. One repo conformance suite that Postgres will reuse later | A1 | the suite itself | 07, 03 |
| A3 | Auth and tenant context: `AuthVerifier` port, `FakeAuth`; tenant comes from the token only | A1 | a tenant id in the body or query is ignored | 03 s7, E1.7 |
| A4 | Inbound path: webhook route, dedupe into inbound events, return 200, ingest job, `agent_run` job | A2 | duplicate webhook = one row; unknown key = 404 | 02, 06 |
| A5 | Jobs: in-memory queue and runner with lease, retry, dead-letter, one run per conversation at a time | A2 | two runners never take the same job | 02, ADR 0003 |
| A6 | Window and send rules (pure, fake clock, IST): 24-hour window, template fallback, STOP opt-out, quiet hours | none | boundary tests at 24h, STOP before agent | 02, FR-11/13 |
| A7 | Post-step and outbox: re-run the guard, choose send mode, write outbox with idempotency key, send via provider, record unknown outcomes | A2, A6, B1 (guard signature) | kill-mid-send never double-sends | 09 s2.4 |
| A8 | Hold-and-escalate, backend half: review item, holding reply, owner alerts (email, WhatsApp, flag), reminders at 30 min, 2 h, 4 business hours, resolve on owner reply | A5, A7 | fake-clock reminder tests; one holding reply per item | ADR 0025, 04 s7 |
| A9 | Frontend contract harness: list every call in `frontend/src` (about 43 method+path patterns), one red test per route; then build routes (conversations and messages first) | A1, A2 | the red suite | 07, parity ledger |
| A10 | ChatSyncs adapter and live spike when the test number arrives; keep the open-questions tracker current | test number, A4 | adapter passes the conformance suite on recorded fixtures | 06, chatsyncs-open-questions.md |
| A11 | CI and repo hygiene: CODEOWNERS (needs both GitHub handles), branch protection, Dockerfile | none | CI green on a PR | root `.github/` |
| A12 | Parked until slice 0 works: Postgres migrations, roles and RLS (turn `tests/rls` green), Postgres repos running the A2 suite, Oracle hosting (ADR 0030) | slice 0 | `tests/rls` and repo suite green on Postgres | 03, E1.2 to E1.7 |

## Dev B: agent
| ID | Item | Needs | Test first | Refs |
|---|---|---|---|---|
| B1 | Reply guard (pure): never state floor price or cost, discount within `max_discount_pct`, item available, no invented claims (warranty, inspection, finance), phone and link allow-list, language | none | red guard tests for each rule | ADR 0019, 08 |
| B2 | Model gateway: task name to model config, `ScriptedLLM` fake for tests, `embed(texts)`; real provider later | none | the same graph runs on the fake | ADR 0011, 04 |
| B3 | Graph skeleton: load context, understand, tool loop, draft, guard, finish or review. Caps in code: 4 tool calls, 6 LLM calls, 25 s | B1, B2 | cap exceeded gives `ReviewRequest`, never a partial reply | ADR 0018 |
| B4 | Tools over the read ports: `search_inventory`, `get_item`, `lookup_knowledge`; own loop with a per-run allow-list; a read error is never turned into "not found" | B3 | read error leads to review, not "no match" | 09 s2.3 |
| B5 | Prompts as data: layering (global, persona, per-business), seeds ported from the old app with invented claims, "Rahul" persona and floor-price text removed | B3 | lint bans the removed phrases | 08, prompts/README.md |
| B6 | Hold decisions and injection defence: reason codes, holding reference (never free text), customer text only in delimited data blocks | B3 | injection cases never reach tools | ADR 0019, 0025 |
| B7 | Lead and visit proposals: funnel stage, score, summary note | B3 | stage moves forward only | 08, 09 |
| B8 | Eval set: about 30 golden cases (English, Hindi, Marathi, Hinglish), a grader that does not import the guard, scripted run on every PR, real model nightly | B3 | a deliberately broken guard turns the evals red | 08 s3 |
| B9 | Retrieval: chunking, embeddings, thresholds | B2, A2 (catalog data) | failure is an error, not an empty result | 08 |
| B10 | Tracing: Langfuse with names and phone numbers masked; fill the run report | B3 | seeded-PII test: no name or phone in the report | 09 s2.5 |
| B11 | AI disclosure wording and persona rendering | owner wording | disclosure present on first AI message | PRD FR-25 |

## Joint
| ID | Item | Needs | Done when |
|---|---|---|---|
| J1 | Slice 0 test: scripted inbound through the real graph, guard, outbox and `FakeProvider`, including the hold path with an owner alert | A4, A7, A8, B3 | one end-to-end test green with no database |
| J2 | Seam contract tests: schema snapshots, additive-only rule | none | changing a seam model fails CI until the version is bumped |
| J3 | Replace `ScriptedAgent` with the real graph in the app wiring | J1 | same scenarios green on both |

## Missing pieces to decide soon (not blocking)
- Settings and secrets policy beyond `.env.example` (who owns it: Dev A).
- Logging format and redaction rules (Dev A, with a seeded-secret test).
- A one-command local run (Makefile or `uv run` script).
- Dependency policy: new dependency = PR note to the other developer.
