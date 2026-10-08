/**
 * Real cancellation via AbortController, replacing every withTimeout()/
 * Promise.race call site touched by this PRD (GENAI_POC_PRD.md §5.4).
 * Unlike Promise.race, aborting the signal actually terminates the
 * underlying HTTP request — the OpenAI SDK is fetch-based and propagates
 * the AbortSignal down to the socket.
 */
export async function withAbortTimeout<T>(
  timeoutMs: number,
  label: string,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fn(controller.signal);
  } catch (err: any) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${timeoutMs}ms (request aborted)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
