// Thin authenticated client for the SmartProps public API (/api/v1). Config from
// env: SMARTPROPS_API_KEY (required, an sp_live_… key) and SMARTPROPS_API_URL
// (optional; defaults to the hosted app). Errors normalize the API's
// { error: { code, message } } envelope into ApiError.

const BASE = (process.env.SMARTPROPS_API_URL || "https://app.smartprops.io").replace(/\/+$/, "");
const KEY = process.env.SMARTPROPS_API_KEY || "";

export const API_BASE = BASE;
export const HAS_KEY = KEY.length > 0;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | undefined | null>;

function qs(params?: Query): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  if (!KEY) {
    throw new ApiError(0, "no_api_key", "SMARTPROPS_API_KEY is not set. Generate one in Settings → Integrations → API keys.");
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (e) {
    throw new ApiError(0, "network_error", `Could not reach ${BASE}: ${(e as Error).message}`);
  }

  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
  }

  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = (body as any)?.error;
    throw new ApiError(res.status, err?.code || `http_${res.status}`, err?.message || res.statusText || "Request failed");
  }
  return body;
}

export const api = {
  get: (path: string, params?: Query) => request(`${path}${qs(params)}`),
  post: (path: string, body: unknown) => request(path, { method: "POST", body: JSON.stringify(body) }),
};
