# Skills used in this project

Installed 2026-10-07 at project scope in `vyavsay-v2/` (`.claude/settings.json`, `.claude/skills/`). Moved here from the repo root.
Keep this file updated when a skill is added, removed or upgraded.

## Plugins

| Skill / plugin | Purpose | Used in phase | Source / version |
|---|---|---|---|
| superpowers | Engineering discipline: brainstorm, plan, subagent-driven build, test-first, code review, finish branch | Build | obra/superpowers via claude-plugins-official, 6.4.1 |
| bmad-method | Planning: analysis, PRD, architecture, stories with specialist roles | Plan | bmad-code-org/bmad-plugins, 6.13.0-next (pre-release) |
| context7 | Up-to-date library docs (FastAPI, LangGraph, LiteLLM, pgvector) | All | claude-plugins-official |
| langchain-skills | LangGraph agent patterns: handoff, durable execution, tool loops | Agent design, Build | langchain-ai/langchain-skills, 0.1.2 |
| supabase | Supabase DB, auth, RLS, pgvector, migrations | Tenancy, Data design | supabase/agent-skills |
| postgres-best-practices | Postgres schema, query and index performance | Data design | supabase/agent-skills |

## Project skills (`.claude/skills/`)

| Skill | Purpose | Used in phase | Source |
|---|---|---|---|
| langfuse | Tracing, prompt management, datasets, evals (uses `npx langfuse-cli`, read-only commands pre-approved) | Observability, Evals | langfuse/skills 1.10.0 (reviewed) |
| agent-governance | Tool allowlists, rate limits, injection checks, audit logs for agents | Agent design, Security | github/awesome-copilot (reviewed) |
| architecture-decision-records | Record each design decision with context, options, consequences | Audit, Design | wshobson/agents (reviewed) |

## Pending / not installed
- `../SKILL.md` (ChatSyncs API guide, Node-oriented): rewrite for Python as `.claude/skills/chatsyncs-api/` when the provider work starts.
- FastAPI: no official skill found. Write our own small one.
- production-agent: write our own from the langchain, langfuse and governance skills.
- agent-evaluation (third-party registry): not reviewed, not installed.

## Rules
- Read any third-party skill before installing it, and pin the version.
- The frontend is reused as-is. Skills must not plan frontend changes unless a design or system flaw forces it.
