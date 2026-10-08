# 003. GPT-4o via GitHub Models for all LLM calls
**Status:** Superseded by 004
## Context
- Initial build (9771815): free endpoint, key `GITHUB_PAT`. Later downgraded to gpt-4o-mini (3adf499) after rate limits.
## Decision
- One OpenAI-compatible provider for text, vision, embeddings.
## Consequences
- GitHub retired it 2026-07-30. All AI silently fell back to canned text for about a week.
- Leftover: `backend/src/agent/openai-client.ts` still targets the retired endpoint. `GITHUB_PAT` still in config.
- PRD, MASTER_PLAN, AUDIT still say GPT-4o.
