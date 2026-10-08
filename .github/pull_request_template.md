## What and why

## Checklist
- [ ] The failing test came first and is in this PR
- [ ] `uv run ruff check . && uv run mypy app && uv run lint-imports && uv run pytest --ignore=tests/rls`
- [ ] No secrets, customer data or real phone numbers
- [ ] Touches the seam (`app/ports/agent*.py`)? The other developer approved and `AGENT_CONTRACT_VERSION` is bumped if needed
- [ ] Touches `frontend/` or `backend/`? Don't. Flag it in the PR with evidence instead
- [ ] BACKLOG.md item ticked (if this finishes one)
