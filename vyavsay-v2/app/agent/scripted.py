"""ScriptedAgent: replays fixed outcomes. Lets the backend be built and tested without the graph."""

from collections.abc import Callable, Sequence

from app.ports.agent import NoReply, ProposedReply, ReviewRequest, RunInput, RunResult

Outcome = ProposedReply | ReviewRequest | NoReply
Step = Outcome | Callable[[RunInput], Outcome]


class ScriptExhausted(AssertionError):
    pass


class ScriptedAgent:
    def __init__(self, script: Sequence[Step]) -> None:
        self._script = list(script)
        self.inputs: list[RunInput] = []

    async def run(self, inp: RunInput) -> RunResult:
        self.inputs.append(inp)
        if not self._script:
            raise ScriptExhausted("ScriptedAgent has no outcome left for this run")
        step = self._script.pop(0)
        outcome = step(inp) if callable(step) else step
        return RunResult(run_id=inp.run_id, outcome=outcome)
