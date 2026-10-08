"""What the schema must look like, from docs/03-tenancy-data.md and ADRs 0002, 0012, 0014, 0016.

One place for names, so a schema change is a one-file test change.
"""

APP = "app"
LANGGRAPH = "langgraph"

# Tables the seed needs (story E1.3). If one is missing the helpers raise SchemaMissing.
CORE_TABLES = [
    "app.tenants",
    "app.tenant_members",
    "app.plan_tiers",
    "app.tenant_config",
    "app.whatsapp_numbers",
    "app.contacts",
    "app.conversations",
    "app.messages",
]

# Roles from ADR 0002 / doc 03 s2 that migrations create (without passwords).
ROLES = ["app_user", "worker_user", "worker_role", "webhook_user", "webhook_role"]
LOGIN_ROLES_ZERO_GRANTS = ["app_user", "worker_user", "webhook_user"]
NO_BYPASS_ROLES = [*ROLES, "authenticated", "anon"]

# Doc 03 s3: tables with no tenant_id column (T1 allow-list). Everything in `langgraph`
# is keyed by a thread_id prefix instead (doc 03 s3.6).
NO_TENANT_ID_COLUMN = {
    "app.tenants",  # its id is the tenant
    "app.plan_tiers",
    "app.platform_admins",
    "app.offboarded_users",
    "app.endpoint_keys",
    "app.provider_apps",
    "app.webhook_dead_letters",
}

# FK parents a tenant table may reference without carrying tenant_id.
SIMPLE_FK_PARENTS = {"app.tenants", "app.plan_tiers", "auth.users"}

# SECURITY DEFINER allow-list (ADR 0012 plus doc 03 s2). A trailing * means a name prefix.
DEFINER_ALLOW = {
    "current_tenant_id",
    "tenant_active",
    "resolve_endpoint_key",
    "resolve_number_ref",
    "claim_jobs",
    "enqueue_due_followups",
    "list_numbers_for_health",
    "list_tokens_expiring",
    "owner_overview_*",
    "provision_tenant",
    "offboard_tenant",
    "enqueue_owner_action",
    "owner_resolve_review",
}

# Execute matrix for functions that exist (doc 03 s2, ADR 0014). role -> may execute.
FUNCTION_EXECUTE = {
    "current_tenant_id": {"authenticated": True, "worker_role": False, "webhook_role": False},
    "worker_tenant_id": {"worker_role": True, "webhook_role": False},
    "enqueue_owner_action": {"authenticated": True, "worker_role": False, "webhook_role": False},
    "provision_tenant": {"authenticated": True, "worker_role": False, "webhook_role": False},
    "resolve_endpoint_key": {"webhook_role": True, "authenticated": False},
    "resolve_number_ref": {"webhook_role": True, "authenticated": False},
    "claim_jobs": {"worker_role": True, "authenticated": False, "webhook_role": False},
}

# Class C (doc 03 s4): no grant and no policy for authenticated.
CLASS_C_FOR_API = [
    "app.tenant_secrets",
    "app.jobs",
    "app.outbound_messages",
    "langgraph.checkpoints",
]
CLASS_C_OPTIONAL = [
    "app.agent_runs",
    "app.llm_usage",
    "app.endpoint_keys",
    "app.provider_apps",
    "app.calendar_inbox",
    "langgraph.checkpoint_blobs",
    "langgraph.checkpoint_writes",
]

# webhook_role may INSERT here and nothing else (doc 03 s2).
WEBHOOK_INSERT_ONLY = ["app.inbound_events", "app.webhook_dead_letters"]

# Phone numbers and names are identical across tenants where the schema allows it.
CUSTOMER_PHONE = "+919811111111"
CUSTOMER_NAME = "Rahul"
MESSAGE_BODY = "Is the Swift still available?"
