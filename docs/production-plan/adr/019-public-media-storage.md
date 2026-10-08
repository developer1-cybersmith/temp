# 019. Customer and catalog media in public Supabase buckets
**Status:** Accepted (inferred; migration 010)
## Context
- Dashboard needs `<img>`/`<audio>` URLs.
## Decision
- `whatsapp-media` and `catalog-images` public; per-user path prefix; URL stored on message/item.
## Consequences
- Customer voice and photos reachable by URL (privacy risk). Orphans never cleaned. MIME trusted from client. Review before launch.
