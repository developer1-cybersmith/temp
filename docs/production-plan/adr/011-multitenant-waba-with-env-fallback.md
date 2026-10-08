# 011. One WABA number per tenant, env fallback for single tenant
**Status:** Accepted (inferred; migration 009 comments)
## Context
- Phase 1 single tenant, Phase 3 Embedded Signup.
## Decision
- `wb_waba_accounts`: UNIQUE(user_id), UNIQUE(phone_number_id). Token column `access_token_encrypted` holds plaintext ("encrypt later").
- Fallback: env `META_PHONE_NUMBER_ID` maps to the oldest `wb_users` row; sends fall back to env system token.
## Consequences
- Unsafe with 2+ tenants (misrouting, platform number used).
- No API to create rows (SQL by hand). No app-to-WABA subscribe code. Token must be encrypted before launch.
- No plan/quota enforcement; pricing is marketing copy only.
