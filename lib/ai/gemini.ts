// Thin wrapper around the Gemini generateContent REST endpoint with automatic
// retry/backoff for transient errors (429 rate-limit, 500/503 overloaded).

export async function geminiGenerate(
  model: string,
  apiKey: string,
  body: unknown,
  opts?: { retries?: number }
): Promise<Response> {
  const retries = opts?.retries ?? 2;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const transient = new Set([429, 500, 503]);

  let last: Response | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok) return resp;
    last = resp;
    if (!transient.has(resp.status) || attempt === retries) return resp;
    // backoff: 600ms, 1200ms
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  return last as Response;
}

/** Friendly message for a failed Gemini response status. */
export function geminiErrorMessage(status: number): string {
  if (status === 503 || status === 500) return "The AI service is busy right now. Please try again in a moment.";
  if (status === 429) return "AI rate limit reached. Please wait a few seconds and try again.";
  return `AI error (${status})`;
}
