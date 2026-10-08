# 0010. Config, secrets and media storage

Status: Proposed (catalog image URL point needs owner confirmation)
Date: 2026-10-07

## Context
H-07 (secrets in docs). Per-tenant provider tokens, Cal.com API keys (Google refresh tokens dropped by 0026), voice audio, and catalog photos the frontend renders by stored URL.

## Decision
- Deploy config via env from Terraform, validated by `pydantic-settings`; app fails fast.
- Platform secrets in AWS Secrets Manager, injected by ECS at task start; api and worker get separate DB credentials; Supabase service-role key only in the migration CI job.
- Per-tenant secrets in DB, envelope-encrypted (KMS data key, AES-GCM, `key_id`); decrypted only in adapters; never returned or logged. A single redacting logger (FR-25).
- Media in private S3 (SSE-KMS, versioned); voice and customer media by short-lived signed URL after tenant check. Catalog photos: CloudFront with unguessable keys, because the frontend stores and renders returned URLs (`ItemModal.tsx:67`).
- gitleaks in CI and pre-commit; `.env.example` names only.

## Consequences
+ No secrets at rest in repo or images; rotation by version. - KMS cost and latency (cached); catalog photos are public-by-link.

## Alternatives
Supabase Storage for media (second storage system to back up); signed URLs for catalog (breaks stored URLs, needs frontend change).
