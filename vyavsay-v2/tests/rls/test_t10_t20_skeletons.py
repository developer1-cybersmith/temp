"""T10 to T20 skeletons (E1.T2). Red on purpose: each names the story that must turn it green.

Mapping is doc 05-roadmap s6a. Replace the body with the real test inside the owner story.
"""

import pytest


def red(test_id: str, story: str, what: str) -> None:
    pytest.fail(f"{test_id} not built yet. Owner story: {story}. Expect: {what}", pytrace=False)


def test_t10_vector_search_isolation() -> None:
    """T10. Owner story: E4.3. Vector search with identical vectors in A and B."""
    red("T10", "E4.3", "only A rows")


def test_t11_owner_overview_admin_only() -> None:
    """T11. Owner story: E3.8. Owner overview as non-admin is denied; as admin counts only."""
    red("T11", "E3.8", "denied for non-admin; counts only and audited for admin")


def test_t12_explain_hot_queries_use_tenant_index() -> None:
    """T12. Owner story: E1.12. EXPLAIN of the 10 named hot queries."""
    red("T12", "E1.12", "tenant index used; initplan for the helper")


def test_t13_webhook_unknown_key_and_replays() -> None:
    """T13. Owner story: E2.2. Unknown endpoint_key, replayed id, same id on another number."""
    red("T13", "E2.2", "404; one row; separate rows per number")


def test_t14_usage_limit_under_parallel_calls() -> None:
    """T14. Owner story: E7.5. 20 parallel calls at the boundary incl. the empty first insert."""
    red("T14", "E7.5", "never exceeds the limit; first insert rejected")


def test_t15_tenant_offboarding_leaves_nothing() -> None:
    """T15. Owner story: E8.8. Zero tenant rows in app and langgraph; audit anonymised."""
    red("T15", "E8.8", "all tenant data, secrets and llm_usage gone; checklist items done")


def test_t16_retention_purges_only_aged_rows() -> None:
    """T16. Owner story: E8.6. The purge_* jobs (messages, audio, inbound payload, checkpoints)."""
    red("T16", "E8.6", "only aged rows purged, tenant-scoped")


def test_t17_authenticated_cannot_update_plan_status_limits() -> None:
    """T17. Owner story: E1.4. Direct SQL updating plan_code, status, limit_overrides."""
    red("T17", "E1.4", "permission denied")


def test_t18_pending_and_suspended_tenants_cannot_write() -> None:
    """T18. Owner story: E1.7. Catalog write and enqueue_owner_action for pending/suspended."""
    red("T18", "E1.7", "denied at the DB, via SQL and via routes")


def test_t19_checkpointer_isolation_and_no_drift() -> None:
    """T19. Owner story: E4.5 (drift check E4.12). Worker A loads B's thread; setup() drift."""
    red("T19", "E4.5", "not found; migrated tables equal setup() output")


def test_t20_provision_tenant_is_idempotent_and_safe() -> None:
    """T20. Owner story: E1.7. 10 parallel calls, unconfirmed email, tombstone, arg spoof."""
    red("T20", "E1.7", "one tenant; refused; refused; no argument exists")
