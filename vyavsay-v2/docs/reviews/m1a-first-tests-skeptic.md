# M1a first tests: skeptic review

Verdict: approve with fixes. Gates reproduced: pytest 157 failed (all tests/rls) / 472 passed / 39 skipped; ruff, mypy (15 files), lint-imports all clean. No test DB left behind after a completed run; no provider names in app/core or app/ports.

## Blockers
- None found. A pytest run killed mid-way (my timeout) left `vyavsay_test_*` DB for a while; it was gone after the process ended. Harness drops in `finally` only, so a hard kill leaks. Add a stale-DB sweep at harness open.

## Improvements
1. 39 skips are all conformance, capability-gated (idempotent send, status, text-in-template-only). Fine, but a provider that under-declares `idempotent_send=False` while deduping passes silently. Add: flag False => assert duplicates are possible (or document the rule).
2. No mutation check done on the fake. Flip each flag in the fake and confirm a test goes red (at least correlation_echo, idempotent_send, voice_notes).
3. T4 worker tests accept "permission denied" as "nothing seen". Pair with a positive control (worker with context sees own rows) so a broken grant cannot mask a leak.
4. Red reasons are SchemaMissing (good). T10-T20 are explicit pytest.fail skeletons (good); T21-T25 have no owner: assign.
5. Role names are dropped cluster-wide on harness open/close. Fine for a test cluster; guard against a non-local URL.
6. Add the import-linter contract: only `app.bootstrap.registry` may import `app.adapters.*` (today enforced only by an AST unit test).
7. FakeProvider: not a lowest-common-denominator trap (8 flag variants plus template-only and minimal). Still lacks 429/5xx and history endpoints; needed before E2.14.
8. `ruff format --check` flags 6 files; run the formatter.
9. Open owner decision: pending-tenant reads (ADR 0014 vs doc 03). T7 follows the ADR.
