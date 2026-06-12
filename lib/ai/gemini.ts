// Thin wrapper around the Gemini generateContent REST endpoint with automatic
// retry/backoff for transient failures — 429 (rate limit), 500/503 (model
// overloaded / busy), and network errors. Backoff is exponential with jitter,
// honors a Retry-After header when present, and is bounded so total added
// latency stays within typical serverless function timeouts.

const TRANSIENT_STATUS = new Set([429, 500, 503]);
const MAX_BACKOFF_MS = 4000;

function backoffMs(attempt: number, resp?: Response): number {
  // Honor Retry-After (seconds) when the API sends one (often on 429).
  const retryAfter = resp?.headers.get("retry-after");
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 8000);
  }
  // Exponential: 500, 1000, 2000, 4000 (capped) + up to 250ms jitter so
  // concurrent callers don't retry in lockstep.
  const base = Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
  return base + Math.random() * 250;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function geminiGenerate(
  model: string,
  apiKey: string,
  body: unknown,
  opts?: { retries?: number }
): Promise<Response> {
  const retries = opts?.retries ?? 3;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = JSON.stringify(body);

  let lastResp: Response | null = null;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (resp.ok) return resp;

      lastResp = resp;
      lastErr = null;
      // Non-transient (e.g. 400 bad request, 403 bad key) → surface immediately.
      if (!TRANSIENT_STATUS.has(resp.status) || attempt === retries) return resp;
      await sleep(backoffMs(attempt, resp));
    } catch (err) {
      // Network blip (DNS, connection reset, etc.) — also transient.
      lastErr = err;
      lastResp = null;
      if (attempt === retries) throw err;
      await sleep(backoffMs(attempt));
    }
  }

  // Exhausted retries: return the last HTTP response if we have one, else rethrow.
  if (lastResp) return lastResp;
  throw lastErr;
}

/** Friendly message for a failed Gemini response status. */
export function geminiErrorMessage(status: number): string {
  if (status === 503 || status === 500) return "The AI service is busy right now. Please try again in a moment.";
  if (status === 429) return "AI rate limit reached. Please wait a few seconds and try again.";
  return `AI error (${status})`;
}
