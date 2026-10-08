# 018. Google Sheets two-way sync via REST, single global sheet
**Status:** Accepted (inferred; commits 1cc8094, fd397fc)
## Context
- `googleapis` broke build and memory; replaced with fetch + google-auth-library.
## Decision
- One env sheet ID and service account. Cron runs for one arbitrary user. 12 fixed car columns.
## Consequences
- Not multi-tenant: exports overwrite each other.
- Import replaces `attributes` and skips embeddings.
