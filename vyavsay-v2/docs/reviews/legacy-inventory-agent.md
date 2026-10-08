# Legacy Inventory C: Agentic Workflow and AI

**Summary**
1. Only ONE reply path is live: `pipelineService.processIncomingMessage` (Groq text, Gemini vision, Jina embeddings). The LangGraph-JS path is unreachable: `dispatchToPipeline` has no caller and all four webhook sites call the pipeline directly (`webhook-routes.ts:225,257,331,371`).
2. The live path is a 1,300-line imperative script, not an agent: 2 to 3 LLM calls per message, regex and rules do most routing (location, negotiation, photos, handoff), and several of those branches ignore `ai_paused` and `auto_reply_enabled`.
3. Prompts hold fabricated claims (150-point inspection, 6-month warranty, bank rates, "3 people asked this week"), a fake persona ("Rahul, 8+ years") and floor-price data. Only the structure, intent list, Hinglish examples and templates are reusable, as DATA.
4. RAG is word-chunked, Jina-embedded, thresholds 0.4 (knowledge) and 0.35 (catalog), and every failure returns `[]`, so an outage looks like "no match". The agent path has 5 tools; its booking tool can never fire.
5. Zero tests, zero evals, no CI. v2 must port behaviour from this document against a new eval set, not from code parity.

Source: static reading only (nothing run). Paths are under `/Users/apple/Vyavsay_Assist-/backend/src` unless stated. Read first: AGENTS.md, `docs/04-agent-design.md`, gap register. Facts marked **(new)** are not in the existing audit.

## 0. File map (AI-related)

| Area | Files | Lines | Status |
|---|---|---|---|
| Live orchestrator | `services/pipeline-service.ts` | 1328 | LIVE |
| LLM calls | `services/ai-router.ts` | 555 | LIVE (analysis, reply, summary, vision, walk-in); `generateFollowUp` has no caller |
| Per-vertical config + prompts | `domains/types.ts`, `domains/domain-router.ts`, `domains/generic/index.ts`, `domains/used-cars/index.ts` | 171, 48, 370, 438 | LIVE |
| RAG and catalog search | `services/rag-service.ts`, `services/catalog-service.ts` | 211, 593 | LIVE |
| Booking | `services/appointment-service.ts`, `services/reminder-service.ts` | 385, 105 | LIVE |
| Follow-ups | `services/cron-service.ts` | 127 | LIVE, barely fires (see 5.5) |
| Voice | `services/voice-transcription-service.ts`, `tts-service.ts`, `routes/voice-routes.ts` | 261, 157, 189 | LIVE; off in pilot (D10) except walk-in extraction |
| Agent graph (LangGraph-JS) | `agent/graph.ts`, `state.ts`, `tools.ts`, `openai-client.ts`, `abortable-call.ts`, `nodes/*` (5) | 143, 115, 225, 16, 26, 608 | DEAD |
| Switch | `routes/webhook-routes.ts:14,22-56` | | DEAD |
| Owner controls | `routes/conversation-routes.ts:83-143`, `utils/validation.ts:71-84,113-115` | | LIVE |
| Docs | `PROJECT_HANDOFF.md:48-52,194-197`, `README.md:185`, `MASTER_PLAN.md`, `docs/production-plan/adr/014` | | `GENAI_POC_PRD.md` is cited by code (`agent/graph.ts:75`) but is not in the repo |

## 1. The two reply paths

### 1.1 Which one runs

| Fact | Evidence |
|---|---|
| Flag read once at boot: `process.env.USE_AGENT_GRAPH === 'true'` | `webhook-routes.ts:14`; not in `config/environment.ts` |
| Only user of the flag is `dispatchToPipeline` | `webhook-routes.ts:22-56` |
| `dispatchToPipeline` is never called. All sites bypass it: text `:225`, button `:257`, audio `:331`, image `:371` and caption fallback `:380` | `grep` over `backend/` finds no other reference |
| Even if wired, the graph would call a dead endpoint (`models.inference.ai.azure.com`, `GITHUB_PAT`) | `agent/openai-client.ts:11-16`; `PROJECT_HANDOFF.md:51` |
| Agent model env is the same variable as the live path (`AI_MODEL`), with a different default (`gpt-4o-mini` vs `llama-3.3-70b-versatile`) **(new)** | `agent/openai-client.ts:16`, `ai-router.ts:19` |

### 1.2 Path A: live pipeline (`pipelineService.processIncomingMessage`)

Trigger: Meta webhook, HMAC ok, `setImmediate`, dedup by `wh_message_id`, then per message type (`webhook-routes.ts:92-112,183-270`). No queue, no retry, no ordering per conversation (two quick messages run in parallel, each reading history before the other's reply).

| # | Step (line) | DB reads / writes | Model call | Side effects |
|---|---|---|---|---|
| 1 | Get or create user; missing user is created as "Demo Business" (`:57-81`) | R/W `wb_users` | none | creates tenant rows from an unknown id **(new)** |
| 2 | Resolve `domain` from `user.industry` (`:84`, `domain-router.ts:36-48`) | none | none | |
| 3 | Get or create conversation by `(user_id, customer_jid)` (`:87-121`) | R/W `wb_conversations` | none | |
| 4 | Upsert `customers` by phone, link (`:124-136`) | R/W `customers`, `wb_conversations` | none | |
| 5 | Store inbound; voice prefixed `🎤 [Voice Note]: ` (`:139-155`) | W `wb_messages` | none | |
| 6 | Load history, limit 50 asc (`:158-167`) | R `wb_messages` | none | first 50 messages, not the latest 50 **(new)** |
| 7 | Hard cap at 150 history rows (cannot occur: load limit is 50) (`:170-183`) | W `wb_messages` | none | dead branch **(new)**; would send canned text |
| 8 | Image: identify car, match inventory, canned reply plus 2 photos, upsert lead, return (`:186-273`) | R catalog, W messages, leads | Gemini vision (`ai-router.ts:335-397`), embedding | sends text and images; ignores `ai_paused` |
| 9 | Build "conversation memory" by regex over history and tasks (`:277`, `:873-1028`) | R `wb_tasks` | none | string capped 2000 chars |
| 10 | Analyze: intent, lead score, tasks, appointment, entities, language, sentiment, `should_auto_reply` (`:281`) | none | Groq JSON (`ai-router.ts:73-147`) | fail-open default `general_question` (`:131-146`) |
| 11 | Write intent and confidence on the latest message with same content (`:294-300`) | W `wb_messages` | none | update-with-order-limit is not honoured by PostgREST; voice rows never match **(new, likely)** |
| 12 | Upsert lead, advance funnel stage forward only (`:303`, `:736-836`) | R/W `wb_leads`, `wb_conversations.funnel_stage` | none | |
| 13 | Buying-signal score, close-mode system note at >= 0.7 (`:306-317`, `:839-866`) | W `wb_conversations.buying_signal_score` | none | |
| 14 | Insert each extracted task (`:320-328`) | W `wb_tasks` | none | `due_date` is model text, unvalidated |
| 15 | If `appointment.proposed_time_iso`: `bookSlot` immediately, schedule 2h and 1h timers, push "booked, confirm warmly" system note. If time missing: fetch today and tomorrow slots (`:335-391`) | R/W `wb_tasks`, R `wb_users` hours | none | books on first mention, no customer confirmation; in-memory timers (`reminder-service.ts:21,48`) |
| 16 | Summary, fire and forget when history >= 3 (`:397-401`) | W `wb_conversations.summary, language` | Groq (`ai-router.ts:257-280`) | |
| 17 | Retrieval routing (`:409-516`): inventory if intent in `inventoryIntents` or `query_type != general` or photo or negotiation regex or product named; else knowledge. No inventory hit: knowledge search plus list 5 cheapest and a "NOT in inventory" note | R catalog, R knowledge | Jina embeddings | |
| 18 | Reply gate (`:525-531`): `auto_reply_enabled` and not `ai_paused` and `should_auto_reply` and (confidence >= threshold or intent in `autoReplyIntents`) and no `escalation_reason` | | | |
| 19 | Deterministic branches that run BEFORE the gate is applied: location template (`:538-567`), negotiation (`:569-615`), complaint or sentiment < -0.5 handoff (`:618-630`) | W `wb_messages`, `negotiation_round` | none | **(new)** send even when `ai_paused` or `auto_reply_enabled=false`; none pauses the AI (comments say "for demo reliability" `:178,588,628`) |
| 20 | Reply: photo request gets a template; else `generateReply` (`:632-708`); images sent first (`:644-669`) | W `wb_messages` | Groq (`ai-router.ts:150-254`) | URLs stripped if media sent |
| 21 | If gate failed and no escalation: send `genericAcknowledgement` (`:709-721`) | W `wb_messages` | none | |
| 22 | Crash: send "Our team will get back to you" (`:724-732`) | none | none | canned text, no alert |

Webhook-level extras (live): mark read; voice goes to Groq Whisper then pipeline then optional TTS reply (`webhook-routes.ts:322-345`); the voice quality gates (`voice-transcription-service.ts:98-133`) are NOT applied to WhatsApp audio, only to walk-in capture (flows doc F1).

Defects that change behaviour **(new)**:

| # | Defect | Evidence | Effect |
|---|---|---|---|
| D1 | System steering notes are appended to `historyStrings` after the inbound row, then `generateReply` drops the LAST element (`slice(0,-1)`) and maps every non-`ai:` line to a `user` turn | `pipeline-service.ts:316,355,358,369,390,432,509`; `ai-router.ts:226-235` | With any note: the note is dropped, the current customer message stays in history AND is appended again (duplicate), older notes reach the model as customer turns with "System:" stripped. Booking confirmations and "not in inventory" notes are unreliable |
| D2 | Owner messages are stored with `sender='user'` and mapped to `user` role | `conversation-routes.ts:122-126`, `ai-router.ts:229-235` | Owner replies read as customer speech in later prompts |
| D3 | Customer text is interpolated into the SYSTEM prompt of analysis | `used-cars/index.ts:119-120`, `generic/index.ts:106-107` | Injection sink; "SECURITY" line in the prompt is the only defence |
| D4 | Pause and auto-reply gates are skipped by image, location, negotiation, complaint branches | `:186-273`, `:538-630` | Owner "AI Off" does not fully silence the bot |
| D5 | Nothing in the live path ever sets `ai_paused` | grep: only `conversation-routes` PATCH and `agent/tools.ts:187` | Complaint says "connecting you" and AI keeps replying (audit H-24) |

### 1.3 Path B: LangGraph-JS agent (dead)

Graph: `START -> ingest -> [ai_paused ? END : classify] -> decide_and_retrieve -> [escalated ? persist : generate] -> persist -> END` (`agent/graph.ts:83-109`). State is the `AgentState` interface (`agent/state.ts:62-103`), last-write-wins channels, no checkpointer, no thread id.

| Node | Does | DB | Model, timeout | Failure |
|---|---|---|---|---|
| `ingest` (`nodes/ingest.ts:11-99`) | Same user/conversation get-or-create as path A; stores inbound; loads 50 history rows | R/W users, conversations, messages | none | throws (whole run fails, webhook returns `success:false`, no reply) |
| `classify` (`nodes/classify.ts:16-72`) | `domain.analysisPrompt` JSON call | none | GitHub-hosted `gpt-4o-mini`, 8 s abort | defaults: `general_question`, confidence 0.3, auto-reply true |
| `decide_and_retrieve` (`nodes/decide-and-retrieve.ts:41-179`) | Tool loop, max 5 LLM iterations, 3 tool executions, 6 s per LLM call. System prompt only (no user turn); customer text inside system prompt (`:38`) | via tools | same model, `tool_choice:auto`, temp 0.2 | LLM error: break and continue with no context (`:68-77`). 4th tool call: force-escalate and fixed handoff text |
| `generate` (`nodes/generate.ts:14-91`) | Reply with `domain.replyPrompt`; inventory top 5, knowledge top 3 x 400 chars; `conversationMemory` is always `''` (`:59`) | none | same model, 10 s abort | `domain.fallbacks.aiFailure` text, sent as if an answer |
| `persist` (`nodes/persist.ts:134-167`) | Sends via `cloudClient`, stores AI row with `reasoning_trace`, upserts lead with hard-coded score `'medium'` | W messages, leads, conversations | none | send fail: reply not stored, error logged |

Agent behaviours that differ from path A **(new unless marked audit)**:

| Gap | Evidence |
|---|---|
| No `auto_reply_enabled`, confidence, or `should_auto_reply` gates (audit M-11) | `graph.ts:96` checks `ai_paused` only |
| No tasks, no appointment extraction, no buying signals, no summary, no memory, no location, photo, negotiation or image handling | `persist.ts`, `generate.ts:59` |
| `confirmed_slot` is read by `book_appointment` but no prompt ever produces it, so the booking tool always refuses (audit M-11) | `agent/tools.ts:136-143`, `state.ts:53`; analysis prompts have no such field |
| `search_inventory` drops brand and attributes (audit L-22); uses `hybridSearch` which unions semantic hits with filters even when filters matched | `tools.ts:104-109`, `catalog-service.ts:293-330` |
| `escalate_to_human` stores no reason (audit H-24), sets `ai_paused`, but no owner notification | `tools.ts:184-189` |
| Current message is in history and appended again (duplicate turn) | `generate.ts:66-73` (ingest stored it first, `ingest.ts:78-83`) |
| Handoff and cap texts are hard-coded en/hi strings | `decide-and-retrieve.ts:21-24,168-175` |
| Good ideas to keep: typed tool envelope (never throws), hard tool cap in code, real abort timeouts, per-node timing trace, deterministic `ai_paused` gate | `state.ts:31-36`, `decide-and-retrieve.ts:19,95-113`, `abortable-call.ts`, `persist.ts:100-125` |

### 1.4 Model calls by task and provider (live)

| Task | Provider and model | Params | Timeout | Fail result |
|---|---|---|---|---|
| Analysis (JSON) | Groq `llama-3.3-70b-versatile` (`ai-router.ts:9-19,103-117`) | temp 0.3, max 500 | 20 s `Promise.race`, no abort (`:25,30-43`) | `general_question` defaults |
| Reply | Groq same | temp 0.7 (generic 0.7), max 800, `frequency_penalty` 0.5 used-cars / 0.3 generic (`used-cars:409`, `generic:336`) | 25 s (`:26`) | `fallbacks.aiFailure` ("Ji, abhi thoda busy hoon" / "We will get back to you shortly") sent as the answer |
| Summary | Groq same | temp 0.3 | 12 s | "Conversation in progress." |
| Follow-up text | Groq same | | 12 s | UNUSED; cron sends a fixed English string (`cron-service.ts:118`) |
| Car photo ID | Gemini `gemini-flash-latest`, `reasoning_effort:low` (`:20,24,353`) | max 400, temp 0.2 | 15 s | `is_car:false` |
| Walk-in extraction | Groq same | temp 0, max 500 (`:494-506`) | 15 s | phone-only regex fallback |
| STT | Groq `whisper-large-v3`, OpenAI `whisper-1` fallback (`voice-transcription-service.ts:199,225`) | verbose_json, temp 0, domain vocab prompt | 15 s each | throws; webhook logs, no reply |
| TTS (voice reply) | OpenAI `tts-1` else Groq Orpheus English (`tts-service.ts:55-79`) | | | skipped |
| Embeddings | Jina `jina-embeddings-v4`, 1536 dims (`rag-service.ts:9-18`) | | SDK default | `null` or `[]` |

Latency: no measurement exists. Worst-case serial on path A: analysis (20 s) + retrieval + reply (25 s) before any send, with no typing indicator; flows doc F1 says "under 5 s" is the intent only.

Failure handling summary: every AI failure degrades to canned text that is SENT as the reply (`ai-router.ts:131-146,249-253`; `pipeline-service.ts:724-732`); no alert, no retry, no metric. This caused the multi-day silent outage (`PROJECT_HANDOFF.md:6,188`). v2 equivalent: ADR 0025 holding reply plus owner alert, never canned content.

## 2. Prompts

### 2.1 Structure and variables

| Prompt | Where | Variables | Role of customer text |
|---|---|---|---|
| Analysis (per vertical) | `used-cars/index.ts:97-200`, `generic/index.ts:84-173` | `currentDate, currentTime, dayOfWeek, tomorrowDate, businessName, industry, services, conversationHistory, customerMessage` (`types.ts:33-43`) | inside system prompt (D3). Time uses server clock, not IST (`ai-router.ts:82-86`) **(new)** |
| Reply (per vertical) | `used-cars:205-318`, `generic:178-243` | `businessName, industry, services, conversationMemory, inventoryInfo, knowledgeContext, language` (`types.ts:46-54`) | history as chat turns (D1) |
| Follow-up | `used-cars:323-341`, `generic:248-267` | `businessName, industry, services, customerName, stage, recentHistory` | unused |
| Decision prompt (agent) | `decide-and-retrieve.ts:26-39` | business, intent, entities, language, history tail, message | system role |
| Summary | `ai-router.ts:261-269` inline, no vertical | messages | system role |
| Walk-in extraction | `ai-router.ts:465-489` inline, 3 few-shot examples | transcript | system role |
| Car ID | `ai-router.ts:359-369` inline | none | image |
| Whisper hint | `voice-transcription-service.ts:13-30` (car brands, Hinglish, Marathi words), neutral `:37` | | |

Per-vertical selection: `wb_users.industry` string, lowercased, direct key or alias table, else `generic` (`domain-router.ts:9-47`). Frontend contract: Settings offers only `generic` and `used_cars` (`Settings.tsx:155-161`); onboarding is free text (`Onboarding.tsx:90-93`), so "Real Estate" silently becomes generic. Domain object also carries: 23 (used cars) or 13 (generic) intents with lead score and autoReply flags (`used-cars:26-50`), regex patterns (photo, negotiation, hinglish, customer facts, AI actions: `:70-93`), bilingual location and photo templates (`:345-382`), negotiation config (`:385-395`), limits (history 50 load, 20 to LLM, 3 photos, confidence 0.75, browse 20: `:398-404`), LLM params, fallbacks, price formatters.

### 2.2 Hard-coded claims, persona, discount (audit H-25 to H-28, confirmed with lines)

| Kind | Text (short) | Line | v2 treatment |
|---|---|---|---|
| Persona | "You are Rahul ... selling cars for 8+ years ... You know every car personally" | `used-cars:207` | per-tenant persona from `tenant_config`; omit if empty |
| Invented social proof | "Is hafte 3 log pooch chuke hain", "Is model ki sabse zyada demand hai" | `:254` | delete |
| Invented scarcity and loss framing | "ye last piece hai" (conditional), "next similar 2-3 hafte baad" | `:253,257` | only if stock row says so |
| Invented inspection and warranty | "150-point inspection ... accident-free", "6 month warranty", "Hamare yahan sab included" | `:261,264,268,318` | only from tenant knowledge or attributes (G4) |
| Invented finance facts | Banks HDFC, ICICI, SBI, Axis; 10-12%; 12-60 months; 15-25% down; 24-48 h approval; "price divided by 42" EMI | `:271-277` | tenant knowledge only; EMI only if tenant supplies a rule |
| Invented process facts | RC transfer 15-20 days, insurance same day, NOC 7-10 days, Aadhar and photos | `:279-284` | tenant knowledge doc |
| Invented hours | "showroom 7 baje tak khula hai"; "Monday-Saturday, 10 AM to 7 PM" | `used-cars:232`, `pipeline-service.ts:358` | one hours resolver (L-17) |
| Market-rate anchoring | "Market mein 12L hai, hamare yahan sirf 9.5L" | `:252` | needs a sourced market price, else delete |
| Prompt vs code conflict | Prompt: "NEVER agree to any price below the listed price" (`:228`). Code: replies with "minimum X" and "I can bring it near Y" (`pipeline-service.ts:1152,1157,1184,1189`) | | guard G5/G6 |
| Discount authority | `defaultDiscountPercent` 8 (used cars), 4 (generic), cap 30, `maxRounds` 4 / 1 (`used-cars:386-388`, `generic:313-315`); per-item override from attributes `max_discount_percent, negotiation_percent, discount_percent, max_discount`; floor from `min_price, minimum_price, floor_price, lowest_price, min_sell_price` (`:389-394`) | | `max_discount_pct` per tenant, default 0 |
| Floor revealed | `buildNegotiationReply` states the floor ("minimum ₹X", "best I can do is X") when offer < floor (`:1151-1153,1183-1185`); default floor = list * (1 - 8%) even with no `min_price` (`:1193-1213`) | | never state; guard only |
| Cost and floor data in the prompt | `structuredSearch` does `select('*')` (`catalog-service.ts:345`); the inventory block prints every attribute not matching `image|img|photo|pic|url|link|description` and shorter than 50 chars (`ai-router.ts:169-190`, `agent/nodes/generate.ts:27-45`), so `min_price`, `max_discount_percent` (present in `sample-data/second-hand-cars-negotiation.csv` header) enter the prompt labelled "REAL DATA, use this!" | | public-attribute allow-list from `catalog_schema` |
| Promised capability | MASTER_PLAN expects per-round strategy and an EMI calculator (`MASTER_PLAN.md:228`); code has counters and one template function, no EMI function **(new)** | | not a requirement; do not port |

### 2.3 What is reusable as DATA for v2 prompt versions

| Asset | Source | Use in v2 |
|---|---|---|
| Intent taxonomy (23 used-car, 13 generic) with score and escalate flags | `used-cars:26-50`, `generic:25-38` | seed `understand` schema enum; eval labels. Review `price_negotiation` (generic: escalate, used-cars: reply) and `complaint` (escalate) |
| Intent rules with Hinglish and Marathi-adjacent examples | `used-cars:145-168` | few-shot data for `agent.understand` and eval cases (strip any claims) |
| Entity extraction rules (lakh/crore maths, "automatic wali", "family car") | `used-cars:172-180`, `generic:141-146` | entity normaliser tests; budget parser (also `pipeline-service.ts:1239-1258`) |
| Relative-date rules (kal, aaj, parso, baje) | `used-cars:188-194`, `generic:154-165` | date resolver in code (IST), not in prompt |
| Style rules: 1-3 sentences, no markdown, no emoji unless customer, match language and script, never Urdu script, use "5.5 lakh" | `used-cars:235-249`, `generic:206-217` | persona and style block |
| Anti-repetition and appointment-awareness rules | `used-cars:286-298`, `generic:219-233` | keep; implement via structured `facts_known` state instead of regex memory |
| Objection patterns (too expensive, OLX cheaper, will think, ask family) | `used-cars:259-264` | eval cases and neutral reframing text WITHOUT claims |
| Security rules and redirect lines | `used-cars:223-233,101` | eval bait cases; real defence is in code (ADR 0019) |
| Bilingual location and photo templates | `used-cars:345-382` | seed templates (owner approval; drop "Condition ekdum mint hai", `:367`, a claim) |
| Walk-in extraction prompt and 3 few-shots; name and phone fallbacks | `ai-router.ts:420-489` | reuse for `POST /voice/extract-walkin` (frontend-fixed) |
| Whisper vocabulary hint (brands, Hinglish, Marathi words) | `voice-transcription-service.ts:13-30` | STT config data when voice turns on |
| Sample inventories and negotiation CSV | `sample-data/*.csv` | demo-dealer eval fixture (strip real-looking URLs) |
| Funnel mapping intent to stage | `pipeline-service.ts:813-828` | starting `propose_lead_update` rules; reconcile with UI stages (5.5) |
| Fallback copy ("Ji, aapka message mil gaya hai...") | `used-cars:416-420` | not reused: v2 holding templates must pass the no-promise lexicon (agent design 7a) |

NOT reusable: all text in 2.2 marked "delete", the `Rahul` persona, the sales-psychology block, finance and document knowledge, any hours or discount number.

## 3. RAG

| Topic | Legacy behaviour | Evidence |
|---|---|---|
| Sources | Knowledge: pasted text only (max 50,000 chars). Catalog: items with a generated sentence per item. No PDFs, no per-document records | `validation.ts:71-73`, `knowledge-routes.ts:22-38`, `catalog-service.ts:462-524` |
| Chunking | Whitespace words, 200 per chunk, 40 overlap (step 160), min 20 chars; text under 200 words is one chunk. "Sentence-aware" cut only fires when the second-to-last word of the chunk ends in `.!?` (regex anchored at end), so it almost never applies **(new)** | `rag-service.ts:19-20,171-210,190` |
| Dedup | sha256 of trimmed, lowercased chunk, first 16 hex chars, per user. Edits leave old chunks; "all duplicate" and "embedding failed" both return 0 and the API shows one 400 | `:149-165`, `knowledge-routes.ts:30-32` |
| Embedding | Jina v4 at 1536 dims, same call for passages and queries (no `task` or prefix) **(new, effect unmeasured)**; batch of 30; older rows may hold OpenAI vectors (no re-embed path, flows doc F5) | `rag-service.ts:14-18,116-146` |
| Catalog text embedded | `name, a category, with <priority attrs>, <other attrs as "key: value">, priced at N lakhs`. Includes every non-URL attribute, so `min price: 470000` is embedded and stored in `description`; price baked in goes stale (L-09) **(new for the floor part)** | `catalog-service.ts:462-524` |
| Retrieval, knowledge | Embed query, RPC `wb_match_knowledge`: cosine similarity > 0.4, top 5, filter by `p_user_id` | `rag-service.ts:21-22,28-50`, `002-inventory-and-rag-fixes.sql:28-48` |
| Retrieval, catalog (live) | `searchWithAlternatives`: `ilike '%product_name%'` on active items (limit 5); if all sold, `findSimilar` via vector at 0.35. No category, price or attribute filter in this call | `catalog-service.ts:419-456` |
| Retrieval, catalog (agent) | `hybridSearch`: structured `ilike` filters + vector 0.35 in parallel, merged, top 10; attribute filter uses `ilike attributes->>key` | `:293-380,383-400` |
| Index | knowledge: IVFFlat dropped, no vector index created (comment only); catalog: HNSW m16 ef64 | `002:25-26,121-124` |
| Prompt use | Inventory top 5 (+3 sold, +3 alternatives), knowledge top 3 cut at 400 chars, labelled `KNOWLEDGE BASE:`; no citations | `ai-router.ts:162-223` |
| Routing | Knowledge only when no inventory hit or non-inventory query; never both (M-12) | `pipeline-service.ts:499-516` |
| Failure looks like no match (H-29) | `embedSingle` returns `null` then `[]`; RPC error returns `[]`; catch returns `[]`; semantic catalog likewise. The caller then says the item is "NOT in our inventory" | `rag-service.ts:31,40-48,109-112`; `catalog-service.ts:386,395-403`; `pipeline-service.ts:509` |
| Thresholds | 0.4 and 0.35 were tuned (comment: "0.1 was way too low") for an earlier embedding model; model changed to Jina on 2026-08-06 with no re-evaluation | `rag-service.ts:21`, `PROJECT_HANDOFF.md:51` |
| Tenant isolation | By `p_user_id` argument with the service-role key; no RLS | `rag-service.ts:33-38` |

v2 notes: typed `Found/NotFound/Error`; re-tune thresholds on an eval set per embedding model; embed stable text only; store the model id with each vector; chunk with real sentence boundaries; replace-on-update per document. Plug-in points: vectors in Postgres (ADR 0015), parked with the DB work. The retrieval interface (`search_inventory`, `lookup_knowledge`) can be built now against a fake store.

## 4. Tools

Live path has no tools (retrieval and booking are called imperatively). Agent path defines five (`agent/tools.ts:17-93`), all run by name in `executeTool` (`:203-225`), result envelope `{ok, data?, error?}`.

| Tool | Type | Input (required) | Output to model | Side effect / state | Problems |
|---|---|---|---|---|---|
| `search_inventory` | read | `query`; `category, brand, price_min, price_max` | `{count, items[0..5]}` (full rows incl. attributes) | sets `retrievedContext` | brand and attributes ignored (`:104-109`); description says "dealership" |
| `lookup_knowledge_base` | read | `query` | `{count, chunks[]}` | sets context | failure = empty |
| `check_appointment_availability` | read | `date` YYYY-MM-DD | `{date, slots[]}` plus a "System:" note | sets context | no per-vertical hours beyond `wb_users.working_hours` |
| `book_appointment` | WRITE | `service, dateTimeIso` | `{message}` or error | inserts `wb_tasks` row | refused unless `entities.confirmed_slot`, never produced; no past-date check (`appointment-service.ts:218-267`); not idempotent |
| `escalate_to_human` | WRITE | `reason` | `{reason}` | `wb_conversations.ai_paused=true` | reason dropped; no alert; model-chosen |

User/conversation ids come from graph state, not model arguments (good; keep: AGENTS.md rule). The model can call a WRITE tool directly (v2 changes this to propose-only).

Imperative "tools" in the live path that v2 must cover as deterministic steps or tools:

| Capability | Where |
|---|---|
| Slots: working hours JSON, 30-min default, IST handling, overlap check, 3 alternatives over 4 days | `appointment-service.ts:34-46,175-212,350-384` |
| Booking row = `wb_tasks` with `appointment_time`; 2h and 1h timers | `:310-322`, `reminder-service.ts` |
| Photos: send up to 3 images per item (1 for non-photo asks), strip URLs | `pipeline-service.ts:644-669,1099-1107` |
| Product inference from last 12 history lines against 200 catalog names | `:1031-1074` |
| Lead and funnel update, tasks insert | `:736-836`, `:320-328` |

## 5. Behaviour: language, booking, leads, handoff

### 5.1 Language (Hinglish, Marathi)

| Aspect | Legacy | Evidence |
|---|---|---|
| Detection | LLM returns ISO code (`en, hi, mr`) in analysis; stored on `wb_conversations.language` | `used-cars:131`, `pipeline-service.ts:399` |
| Reply language | Prompt rule: reply in the customer's latest-message language; `hi` is labelled "Hinglish"; any other code (e.g. `mr`) is passed raw; used-cars rule says never mix Marathi unless the customer uses it | `used-cars:242-243`, `generic:213-214` |
| Script | Match script: Roman to Roman, Devanagari to Devanagari, never Urdu script | `:243` (7b) |
| Deterministic templates | Choose `hi` if `language_detected` starts with `hi` or `hinglishHint` regex matches; everything else English. Marathi and Roman Marathi ("kay aahe") fall to English (audit M-10) | `pipeline-service.ts:541-544,579,620,1119,1229`; `used-cars:72` |
| STT | Whisper language auto-detect; vocab prompt includes Marathi words | `voice-transcription-service.ts:28-29` |
| Tests | none | |

v2: language and script are checked in the guard (G9); templates per language en, hi, mr and romanised Hinglish need owner-approved wording (agent design 7a).

### 5.2 Booking

Live path books on the first extracted time, with no confirmation turn (`pipeline-service.ts:335-370`); the agent path intended a confirmation gate that cannot work (`tools.ts:136`). Hours and slot length come from `wb_users.working_hours` and `slot_duration_minutes` (default Mon-Sat 10:00-19:00, 30 min, `appointment-service.ts:36-46`). Duplicate rows are possible: extracted `tasks` are inserted (`:320-328`) in addition to the booking row **(new, likely)**. Reminders are in-memory and lost on restart (audit F11). v2 differs by design: Cal.com, customer confirmation, held booking with TTL (ADR 0022, 0026).

### 5.3 Lead and funnel logic

| Rule | Evidence |
|---|---|
| Lead per conversation; score never lowers; stage moves forward only | `pipeline-service.ts:754-782,795-836` |
| Stages written: `inquiry, qualification, test_drive, negotiation, booking, documentation, delivery` (+ legacy `new, engaged, negotiating, booked`) | `:797-810` |
| UI stages: `new, interested, quoted, negotiating, closed`; unknown values show as `new` | `frontend/src/pages/Leads.tsx:14,108-111` |
| Buying signal weights (financing 0.2, test drive 0.25, ready_to_buy 0.3, urgency 0.25, ...); >= 0.7 adds a "close-mode" note | `:843-858,315-317` |
| Score comes from the model (`lead_score`), not from `IntentDefinition.leadScore` (that field is unused) **(new, likely)** | `:303`; no reader of `leadScore` |

### 5.4 Handoff and pause (`ai_paused`)

| Trigger | Legacy result | Pauses AI? |
|---|---|---|
| Complaint intent or sentiment polarity < -0.5 (sentiment only requested by used-cars prompt) | sends "senior team member" text (`:618-630`) | No (D5) |
| Negotiation round > `maxRounds` | sends "beyond my authority ... owner" (`:578-592`) | No |
| `should_auto_reply=false` or low confidence | gate fails, sends generic acknowledgement unless escalation reason set (`:709-721`) | No |
| 150-message cap | dead branch (7 above) | No |
| Owner toggle | `PATCH /conversations/:id {ai_paused}` (`conversation-routes.ts:83-106`; `Conversations.tsx:146`) | Yes; honoured only in gate `:527`, cron `cron-service.ts:116`, agent `graph.ts:96` |
| Owner types a reply | stored as `sender='user'`; sends via cloud client; does NOT pause (audit F6) | No |
| Agent `escalate_to_human` or tool cap | sets `ai_paused=true`, fixed text | Yes |
| Owner notification | none anywhere | |

Frontend contract kept by v2 (zero change): `ai_paused` boolean on conversation, toggle via PATCH, owner message appears as `business_owner` (`Conversations.tsx:165,234`; backend stores `user`, audit F6).

### 5.5 Follow-ups

Cron every 6 h selects leads with `stage IN ('new','contacted')` and `updated_at` older than 48 h, skips `ai_paused`, sends fixed English text, then sets stage `followed_up` (`cron-service.ts:21,103-126`). **(new)** The pipeline writes stages `inquiry, qualification, ...` (5.3), so AI-created leads never match the filter; only leads an owner moved to `new` by hand are nudged. `followup_timer_hours` is ignored; `generateFollowUp` is unused. Out-of-window sends are not handled (H-20).

## 6. Tests and evals

| Item | Finding |
|---|---|
| Unit, integration, contract tests | none: no test files in `backend/` or `frontend/`; `package.json` scripts are `dev, build, start` only |
| Evals or golden sets | none; no Langfuse or other tracing; only `console.log` (215 calls, audit M-19) |
| CI | none (no `.github`) |
| Agent acceptance criteria | cited from `GENAI_POC_PRD.md` ("acceptance criterion #2", `agent/graph.ts:93`), which is missing |
| Review process used | agent-reviewer passes recorded in `MASTER_PLAN.md` (type checks, prompt-quality reads); no executable checks |
| Trace data | `wb_messages.reasoning_trace` (migration 011) is written only by the dead agent path (`011-agent-reasoning-trace.sql:1-19`) |
| Usable seeds for the v2 eval set | prompt examples (`used-cars:145-168,311-318`), walk-in few-shots (`ai-router.ts:478-486`), the two sample CSVs, no real transcripts exist (owner decision 6: no live tenants) |

## 7. Port map (behaviour to v2; DB and infra are parked)

| Legacy behaviour | v2 owner (doc) | Port as | Plugs into (parked) |
|---|---|---|---|
| Analysis JSON (intent, entities, language, sentiment) | `understand` node (04 s2) | prompt version data + Pydantic schema; keep intents and entity rules | `prompt_versions` (DB), gateway task `agent.understand` |
| Reply prompt style rules | `draft` + persona block (04 s4) | style rules as data; drop claims | `tenant_config` persona fields |
| Inventory and knowledge retrieval | `search_inventory`, `lookup_knowledge` (04 s2.2, s3) | fake in-memory store first; typed results | pgvector tables (ADR 0015) |
| Negotiation | guard G5/G6 + `offer_price` | rules in code; templates optional | `tenant_config.max_discount_pct`, `catalog_pricing` |
| Location, photo templates | deterministic answers from tenant config | data templates | `tenant_config` |
| Complaint and handoff | `route=escalate` + holding reply | rules | `review_items`, owner alerts (infra: email, WhatsApp) |
| Booking | `propose_booking`, `confirm_booking` | per ADR 0022/0026 | Cal.com, `bookings` |
| Summary and memory | `summarize` job, structured `facts_known` | replaces regex memory | jobs table |
| Follow-ups | `followups` rows + templates | per 04 s9 | scheduler, templates |
| Walk-in extraction | structured extraction task | port prompt and fallbacks | gateway only |
| Image car ID | out of pilot (D10) | skip | |
| Voice | out of pilot (D10) | skip; keep Whisper hint as data | |

Parity eval idea (needs no DB): replay the same 150 cases through (a) the v2 graph with fake tools and (b) hand-labelled expectations, since the legacy path cannot be run or trusted as an oracle.

## Needs owner decision

1. Negotiation: may the agent name a discounted price within `max_discount_pct`, or only say "the owner will confirm"? (legacy stated a floor; v2 default is authority 0.)
2. Which legacy claims, if any, are true for the pilot dealer (inspection, warranty, finance partners, RC timelines)? Only claims given as tenant knowledge will be allowed.
3. Keep the `generic` vertical and the free-text `industry` field as is (two dropdown values), or onboard only the used-car vertical for pilot?
4. Who labels Hinglish and Marathi eval cases (Marathi templates are absent in legacy, so there is no reference wording).
5. Lead stage vocabulary exposed to the UI: use the UI's `new, interested, quoted, negotiating, closed` (frontend fixed), mapped from internal stages. Confirm.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Treating the dead agent as a spec | Rebuild inherits its gaps (no gates, broken booking, unsafe write tool) | Use only the ideas listed in 1.3; v2 design (04) is the spec |
| Legacy prompt text copied "to keep behaviour" | Fabricated claims and floor leaks return | Allow-list in 2.3; claims removed; guard tests |
| No oracle for "same behaviour" | Parity cannot be proven | Eval set with labelled expectations, not diff against legacy |
| Legacy quirks mistaken for features (D1 to D5, ignored pause on location and negotiation) | Bots reply when owner paused | Contract tests for `ai_paused` on every outbound path |
| Thresholds 0.4 and 0.35 carried over | Over- or under-retrieval with a new embedding model | Re-tune on eval set per model; store model id |
| Frontend contract fields used by AI paths (`ai_paused`, `industry`, `auto_reply_enabled`, `services`, `summary`, `sender`) | Break screens if renamed | Keep in response shaping; contract tests (E3) |
| Conclusions here are from static reading | A hidden runtime path could differ | Findings marked "likely" need a fixture check at M3 start |
