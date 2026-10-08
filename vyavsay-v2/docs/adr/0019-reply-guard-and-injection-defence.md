# 0019. Deterministic reply guard and prompt-injection defence

Status: Proposed
Date: 2026-10-07

## Context
Audit: invented warranty and social proof (H-26), no grounding check (H-27), floor price stated and cost columns in prompts (H-28), prompt-only injection defence (M-04). Customer text, voice transcripts, and owner-imported catalog or sheet text are all untrusted.

## Decision
- The model returns a schema-validated draft with a `claims` list (kind, item ref, value, source ref). It never sends anything.
- A pure `guard` function checks the draft against retrieved rows and tenant config (price and number match, item availability, forbidden-claim lexicon needing a source, discount at or below the limit, no floor or cost figures or wording, hours, link and phone allowlist, canary string, length, language). Result: pass, regenerate once with violation codes, or hold for review. The same function runs again right before the outbox write (state may be stale). Any guard exception holds the reply (fail closed).
- Prices: `catalog_pricing` is never selected by agent queries. The guard alone reads it, through a separate function.
- Floor and cost figures: only amount-like tokens are compared; the declared `offer_price` is exempt, so an allowed offer at `min_price` can be stated (flagged in the trace). Other cost or floor figures hold.
- Discount authority is zero unless `max_discount_pct` allows it; allowed offer floor is the higher of `list_price*(1-max_discount_pct)` and `min_price`.
- Injection: static system prompts; untrusted text only in delimited data blocks with a per-run random boundary; a signal classifier sets `injection_suspected`, which removes confirm and propose tools for that turn and tightens the guard; tool allowlist per run (0018); server-held booking confirmation; every denial is logged to `agent_runs` and Langfuse.
- v1 uses no second LLM verifier. Add one only if evals show lexicon gaps (cost and latency trade-off).

## Consequences
+ Safety does not depend on model obedience; testable without an LLM. - Lexicon and number parsing need maintenance for Hinglish and Marathi; false holds raise owner workload (measured in evals).

## Alternatives
LLM-as-verifier only (adds latency, can itself be injected); prompt rules only (the old approach).
