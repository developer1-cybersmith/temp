# 007. Per-tenant inventory as JSONB, pgvector, hybrid retrieval
**Status:** Accepted (inferred)
## Context
- Business-agnostic SaaS. PRD:236-290, 632-740; migration 002.
## Decision
- `wb_catalog_items` core columns + `attributes` JSONB + HNSW vector. Tenant field list in `wb_users.inventory_schema`.
- Knowledge text kept apart in `wb_knowledge_base` (chunks 200 words, overlap 40, threshold 0.4, top 5, hash dedupe).
- Sold = quantity 0. Delete = `is_active=false`.
## Consequences
- Flexible schema. Schema only drives labels and export, not embedding.
- Default pipeline matches by name ilike; true hybrid search only in the flagged agent path.
- Sheets imports skip description and embedding (invisible to semantic search).
- No HNSW index on knowledge table.
