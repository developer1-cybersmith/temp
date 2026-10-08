# 0004. Compute and hosting

Status: Proposed (provider needs owner choice)
Date: 2026-10-07

## Context
NFR-3 (99.5%) cannot hold on one host. Stateless design (ADR 0003) allows N instances.

## Decision
- One container image, two process types: `api` (FastAPI, webhooks) and `worker` (job loops, cron ticks). Both stateless.
- Pilot: managed container host in an India or nearest Asia region, minimum 2 `api` instances and 1-2 `worker`, health checks on `/livez` and `/readyz`, zero-downtime deploy. Candidates: Fly.io, Render, Railway, AWS App Runner (verify prices, region, SLA).
- Supabase in the closest region (Mumbai if offered; verify). Secrets in host secret store.
- Target is 99.5% for the webhook endpoint only. Inbound loss is covered by the durable inbox plus the F2 reconciliation poll; ChatSyncs retries are unknown (from docs, unverified in practice), so the target must not lean on them.

## Consequences
Cost of 2+ instances. Single-region risk accepted for pilot.
