# 0013. Slow frontend endpoints run as worker jobs

Status: Proposed
Date: 2026-10-07

## Context
`POST /sheets/{action}` must return `message/added/updated` synchronously, but the work involves Sheets, embeddings and LLM calls. Doing it in `api` breaks "api is stateless, no side effects" and session advisory locks are unreliable on the Supabase transaction pooler (verify).

## Decision
- `api` inserts a job (dedup key `sheets:{tenant}`) and waits up to 20 s on the job row. Worker does all external work.
- Done in time: return the real result. Over budget: return 200 with a partial message; job continues.
- A second click joins the running job (same dedup key) instead of starting another.
- Same pattern for any future slow endpoint. No advisory locks; coordination via rows.
- Verify the frontend axios timeout exceeds 20 s (`AIBrain.tsx:190`).

## Consequences
+ api stays thin; one concurrency mechanism. - Up to 20 s request wait; polling DB load (use 500 ms interval).
## Alternatives
Inline in api with advisory lock (rejected). Return 202 and poll (needs frontend change).
