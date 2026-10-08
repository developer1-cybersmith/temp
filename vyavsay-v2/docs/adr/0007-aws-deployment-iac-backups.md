# 0007. AWS deployment, Terraform, backups

Status: Proposed (supersedes the host candidates in 0004; keeps its 2+ instance rule). Backups confirmed by [0027](0027-langfuse-cloud-backups-chatsyncs-wait.md): paid PITR plus daily copy to the owner's S3.
Date: 2026-10-07

## Context
The AWS account is the owner's. Needs: api and HTTP-less worker, 2+ instances, repeatable infra, tested restores (NFR-3, NFR-5).

## Decision
- Region ap-south-1. ECS Fargate: `api` behind an ALB (min 2 tasks, 2 AZs), `worker` (min 2). One image, two entrypoints.
- DB stays Supabase (frontend uses Supabase Auth directly). api on transaction pooler; worker and LangGraph checkpointer on direct/session connections (verify pooler behaviour).
- Terraform (OpenTofu compatible), S3 state with locking, envs `staging` and `prod`. GitHub Actions with OIDC, no static AWS keys. SQL migrations run by a CI job, never at app start.
- Backups: Supabase PITR (verify plan) plus daily `pg_dump` to a versioned, KMS-encrypted S3 bucket; media bucket versioned; restore drill before pilot.
- One NAT for pilot; CloudWatch alarms listed in 02-architecture section 9.

## Consequences
+ Worker fits; reproducible; no static cloud keys. - More infra than a PaaS; Terraform skills needed; cross-network latency app to Supabase (same region mitigates).

## Alternatives
App Runner (no worker, status uncertain, verify); Fly/Render/Railway (owner already has AWS); CDK (team preference not stated); RDS instead of Supabase (loses Auth the frontend needs).
