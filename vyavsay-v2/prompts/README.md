# prompts/

Seed prompts and templates for the agent, stored as DATA. No prompt text lives here yet: it is authored in story E4.30 after the loader and lint (E4.29) exist. Plan: [docs/08-agent-migration-plan.md](../docs/08-agent-migration-plan.md) section 2.

## Why files
- Git is the review trail for wording. Files are the seed for the DB `prompt_versions` rows (global, `tenant_id` NULL). The DB stays the runtime source of truth ([0011](../docs/adr/0011-litellm-in-process.md), [04 s11](../docs/04-agent-design.md)).
- Per-business overrides are DB rows set by the team. Files under `tenants/` are test fixtures only, never production data.

## Layout (planned)
```
prompts/
  README.md                       this file
  manifest.yaml                   one row per prompt: key, version, status, task, output schema name, variables, eval run id
  global/
    agent.understand/v1.md        intent, entities, language, sentiment, wants_human, price_pushback, lead score (high, medium, low, by the rubric in 08 s3.3) and lead_note (one line, max 160 chars) (JSON out)
    agent.act/v1.md               tool-loop instructions (static; untrusted data arrives in delimited blocks)
    agent.draft/v1.md             reply style, structure, claims[] contract, truthful-identity line (never denies being an AI)
    agent.summarize/v1.md
    voice.extract_walkin/v1.md    walk-in form extraction (frontend-fixed route)
  fewshot/
    understand.v1.yaml            Hinglish / Marathi examples, no business claims
    draft.v1.yaml                 about 12 fresh reply examples; claim tokens only, no promise phrasing, none copied from legacy
  persona/
    persona_block.v1.md           renders tenant fields; a field that is empty is omitted
  templates/                      tenant-visible fixed text, per language en, hi, mr, hinglish
    holding/  received/  team_notice/  location/  away/  disclosure/   (disclosure = FR-25 line, added by the post-step to the first AI message)
  tenants/<fixture>/<key>/vN.md   test-only override examples
```

## File format
Markdown body with YAML front matter: `key`, `version` (int), `status` (draft | active | retired), `task` (gateway task name), `schema` (output schema name, defined in code), `variables` (allow-list), `slots` (named override points), and for `templates/`: `language`, `approved_by`, `approved_at` (empty means never sent).

## Rules (checked by the prompt lint test, E4.29)
- Static text only. Customer text, transcripts, summaries, catalog and knowledge text are never interpolated into a system prompt; code adds them as delimited data blocks with a per-run boundary.
- No persona names (Rahul, Priya), city names (Pune), vendor names (OpenAI) and no identity-denial wording ("not a bot", "real person", "never say you are AI"): the AI is never told to hide that it is an AI (PRD FR-25).
- The promise deny-list (holding templates) also applies to draft examples and few-shots; "team se check karke batata hoon" style lines are not allowed anywhere.
- No facts about a business: no persona name, years of experience, warranty, inspection, finance, rates, process timelines, social proof, scarcity, hours, discount numbers, floor or cost wording. Facts come from tenant config and retrieved rows.
- Variables come from the allow-list only (`persona_block`, `now_ist`, `is_open`, `language_rules`). Dates and times are computed in IST by code.
- Tenant overrides may replace named slots (style, domain notes) only. Safety, schema and claims contract are not slots. The guard stays in code.
- One change per version; each version is evaluated before `active`; the version id is saved on every reply.
- Holding, received and team-notice templates must pass the no-promise deny-list test and carry owner approval before they can be sent ([04 s7a](../docs/04-agent-design.md)).

Prompt PR CI is scripted only (no model key). Test-only stub prompts for the S2 slice live in `tests/fixtures/prompts/`, not here.

## Legacy-derived content (backend plan P6.1)
- Rule cases harvested from the legacy code (negotiation, location, slot alternatives, handoff, budget parser) are eval seeds under `tests/eval/seeds/legacy/`, each with a `legacy_ref`. They are not prompt text and do not live here ([07 plan](../docs/07-backend-migration-plan.md) section 6a).
- The four legacy location variants (address and map, address only, map only, none; `pipeline-service.ts:538-566`) become `templates/location/` entries per language. Wording is authored fresh and approved by the owner; legacy wording is not copied.
- Dropped on purpose (08 s2.2, P19 to P21): the "Rahul" persona, "You are NOT a bot" and "NEVER say I'm an AI" lines, reply rule 10, the claim-bearing example conversations (`used-cars:311-318`), and the phone-agent prompts ("Priya", Pune). Legacy wording is a trap list, not a source.
- Unsupported-kind replies (E6.5a) and the holding reply are `templates/` entries too; the placeholder text the owner sees for them is OD-13b.
