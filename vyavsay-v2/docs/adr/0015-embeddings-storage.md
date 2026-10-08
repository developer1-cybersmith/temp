# 0015. Embeddings: one table, tenant filter inside the query, exact search first

Status: Proposed
Date: 2026-10-07

## Context
Old vectors lived on item and chunk rows with no model or version column, HNSW commented out, NULLs never repaired, price baked into embedded text (M-05, L-09, H-30). pgvector HNSW applies filters after the index scan, so a tenant filter can return too few rows.

## Decision
- Table `embeddings(tenant_id, id, catalog_item_id NULL, knowledge_doc_id NULL, chunk_ix, content_hash, model, model_version, embedding extensions.vector(N), created_at)`; two nullable composite FKs `ON DELETE CASCADE` with a CHECK that exactly one is set (one polymorphic `source_id` cannot carry an FK). Extensions `vector`, `pg_trgm`, `btree_gist` live in `extensions`. `N` follows the chosen model (verify Jina dimension). A model with another dimension is a new table plus backfill job, then swap.
- Embedded text is stable text only (no price, no stock). `content_hash` makes sync idempotent; changed hash means re-embed job. Rows with no embedding are listed by a maintenance job and repaired.
- Search is `search_embeddings(query_vec, kind, k)`, SECURITY INVOKER (RLS applies), `WHERE tenant_id = current tenant` inside the query, ordered by `<=>`.
- v1 uses exact search per tenant on a `(tenant_id, source_kind)` btree: tenant slices are small. Add HNSW (cosine) with iterative scan only when a tenant passes about 50k vectors or p95 search exceeds budget (verify pgvector version and `hnsw.iterative_scan`).
- Extension installed in schema `extensions`; migrations create it.

## Consequences
+ Model swap and repair are explicit; no cross-tenant recall effects. - Exact scan will not scale to very large single tenants (named trigger above).
## Alternatives
Vector column on each source table (no clean model swap). Partial HNSW per tenant (index sprawl). External vector DB (second system to back up and secure).
