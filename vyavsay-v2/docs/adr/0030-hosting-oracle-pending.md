# 0030. Hosting moves to Oracle (details pending)

Status: Proposed (owner decision 2026-10-08; supersedes the AWS parts of [0007](0007-aws-deployment-iac-backups.md) until details are settled)
Date: 2026-10-08

## Context
The owner chose "the new Oracle server" instead of AWS Mumbai. The shape is not decided: one VM, several VMs with a load balancer, or managed Kubernetes. The owner deferred the question ("instead of over planning, execution"). The 2+ instance rule from 0007 and 0003 (many instances must be safe) still holds as a design rule, even if one VM runs several containers at first.

## Decision
- Build hosting-neutral now: one container image, `api` and `worker` entrypoints, config from environment, no AWS SDK in core.
- Anything AWS-specific in 0007/0010 (Secrets Manager, KMS envelope, S3 backups and state, CloudFront catalog images, ALB, GitHub OIDC to AWS) is put behind ports (secrets/key store, object storage, CDN) per [0028](0028-provider-portability.md) discipline. Adapters for Oracle (Vault or app-managed keys, Object Storage) are chosen when the server shape is known.
- Dev and CI run with local Postgres and fake adapters. Nothing in M1a depends on the host.

## Consequences
+ M1a to M2 can start now. - Several earlier answers depend on the host and must be re-checked: backups copy target (D7 said the owner's AWS S3), envelope encryption key store, catalog image CDN, TLS and domain, IaC tool, 2+ instance layout and the restore drill.

## Open (owner, later)
Server shape (VM count, region, size), who runs it, backup target, domain and DNS owner, TLS and reverse proxy.
