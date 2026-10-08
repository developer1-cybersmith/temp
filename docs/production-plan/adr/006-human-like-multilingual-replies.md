# 006. Conversation-driven replies, short, with CTA, mirror customer language
**Status:** Accepted (inferred)
## Context
- PRD calls it the core differentiator (PRD:34, 498-530). Languages: English, Hindi, Hinglish, Marathi.
## Decision
- Free chat, not menus. Brief reply plus call to action. Devanagari allowed; Urdu/Arabic script banned (c12290a).
## Consequences
- Quality depends on prompts. Anti-jailbreak rules added (3d829fa).
- Target "no hallucinated products" relies on inventory grounding (see 007).
