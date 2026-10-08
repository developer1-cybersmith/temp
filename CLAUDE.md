# Vyavsay Assist

## Output style (default for this project)
- Keep replies short and simple. The user cannot read long outputs.
- Lead with the conclusion; use brief bullets or small tables.
- Put long analysis in a file and link it instead of pasting it.

## Scope rules
- The frontend is reused as-is. Do not plan frontend migration or changes unless a design or system flaw forces it. If so, flag it with evidence and ask first.
- Understand the current codebase before changing it. The audit is done; never edit the legacy `backend/` or `frontend/`.
- Installed skills and their purpose are listed in `vyavsay-v2/docs/SKILLS.md`. Keep it updated when skills change.

## Legacy vs rebuild
- This repo root (`backend/`, `frontend/`) is the legacy reference. The rebuild lives in `vyavsay-v2/` with its own `CLAUDE.md` and plugins. Start Claude Code from `vyavsay-v2/` for rebuild work.
