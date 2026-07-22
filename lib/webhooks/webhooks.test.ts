import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { subscribes, isWebhookEvent, newEventId, WEBHOOK_EVENTS } from "./events";
import { signBody, signatureHeaders } from "./sign";
import { nextRetryAt, RETRY_DELAYS_MS, MAX_ATTEMPTS } from "./dispatch";
import { validateWebhookUrl, sanitizeEvents } from "./validate";
import { buildProposalPayload } from "./payload";

// Minimal chainable Supabase-query stub. Per table: `single` (→ maybeSingle) or
// `list` (→ .order()/awaited .eq()).
function mockDb(tables: Record<string, { single?: unknown; list?: unknown[] }>) {
  return {
    from(name: string) {
      const t = tables[name] ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve({ data: t.list ?? [] }),
        maybeSingle: () => Promise.resolve({ data: t.single ?? null }),
        then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: t.list ?? [] }),
      };
      return chain;
    },
  };
}

describe("events.subscribes", () => {
  it("empty subscription list matches every event (all)", () => {
    expect(subscribes([], "proposal.sent")).toBe(true);
    expect(subscribes(null, "proposal.signed")).toBe(true);
  });
  it("matches only listed events", () => {
    expect(subscribes(["proposal.signed"], "proposal.signed")).toBe(true);
    expect(subscribes(["proposal.signed"], "proposal.sent")).toBe(false);
  });
});

describe("events.isWebhookEvent / newEventId", () => {
  it("recognises valid types only", () => {
    expect(isWebhookEvent("proposal.sent")).toBe(true);
    expect(isWebhookEvent("proposal.bogus")).toBe(false);
    expect(isWebhookEvent(42)).toBe(false);
  });
  it("mints unique prefixed ids", () => {
    const a = newEventId(), b = newEventId();
    expect(a).toMatch(/^evt_[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe("sign.signBody", () => {
  it("is a verifiable HMAC over `${timestamp}.${body}`", () => {
    const secret = "whsec_test";
    const ts = "2026-07-22T00:00:00.000Z";
    const body = JSON.stringify({ hello: "world" });
    const sig = signBody(secret, ts, body);
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    expect(sig).toBe(expected);
  });
  it("changes with the body (tamper detection)", () => {
    const a = signBody("s", "t", "a");
    const b = signBody("s", "t", "b");
    expect(a).not.toBe(b);
  });
  it("signatureHeaders carries event, delivery id, and a matching signature", () => {
    const h = signatureHeaders({ secret: "s", eventType: "proposal.sent", deliveryId: "d1", rawBody: "{}", timestamp: "T" });
    expect(h["X-SmartProps-Event"]).toBe("proposal.sent");
    expect(h["X-SmartProps-Delivery"]).toBe("d1");
    expect(h["X-SmartProps-Signature"]).toBe(signBody("s", "T", "{}"));
  });
});

describe("dispatch.nextRetryAt backoff", () => {
  const now = Date.parse("2026-07-22T00:00:00.000Z");
  it("schedules each retry at the configured delay", () => {
    expect(nextRetryAt(1, now)).toBe(new Date(now + RETRY_DELAYS_MS[0]).toISOString());
    expect(nextRetryAt(2, now)).toBe(new Date(now + RETRY_DELAYS_MS[1]).toISOString());
    expect(nextRetryAt(5, now)).toBe(new Date(now + RETRY_DELAYS_MS[4]).toISOString());
  });
  it("returns null once attempts are exhausted (→ dead)", () => {
    expect(nextRetryAt(MAX_ATTEMPTS, now)).toBeNull();
    expect(nextRetryAt(MAX_ATTEMPTS + 3, now)).toBeNull();
  });
});

describe("validate.validateWebhookUrl", () => {
  it("accepts https", () => {
    expect(validateWebhookUrl("https://example.com/hook")).toEqual({ url: "https://example.com/hook" });
  });
  it("rejects non-https remote and non-URLs", () => {
    expect("error" in validateWebhookUrl("http://example.com")).toBe(true);
    expect("error" in validateWebhookUrl("not a url")).toBe(true);
    expect("error" in validateWebhookUrl("")).toBe(true);
    expect("error" in validateWebhookUrl("ftp://example.com")).toBe(true);
  });
  it("allows http for localhost testing", () => {
    expect("url" in validateWebhookUrl("http://localhost:3000/hook")).toBe(true);
    expect("url" in validateWebhookUrl("http://127.0.0.1/hook")).toBe(true);
  });
});

describe("validate.sanitizeEvents", () => {
  it("keeps only known events", () => {
    expect(sanitizeEvents(["proposal.sent", "bogus", 3])).toEqual(["proposal.sent"]);
    expect(sanitizeEvents("nope")).toEqual([]);
    expect(sanitizeEvents([...WEBHOOK_EVENTS])).toEqual([...WEBHOOK_EVENTS]);
  });
});

describe("payload.buildProposalPayload", () => {
  const db = mockDb({
    quotes: {
      single: {
        id: "q1", tenant_id: "t1", client_id: "c1", quote_number: "PROP-2026-014",
        title: "Website", status: "signed", selected_scenario_id: null, tax_rate: 0.1,
        valid_until: "2026-08-01", signed_at: "2026-07-22T00:00:00Z", pdf_url: "https://x/p.pdf",
      },
    },
    quote_scenarios: { list: [{ id: "s1", is_recommended: true, sort_order: 0 }] },
    quote_line_items: {
      list: [
        { quantity: 2, unit_price: 100, setup_price: 50, discount_percent: null, discount_amount: null, billing_period: "Monthly" },
        { quantity: 1, unit_price: 1000, setup_price: 0, discount_percent: null, discount_amount: null, billing_period: "One Time" },
      ],
    },
    clients: { single: { id: "c1", company_name: "Acme", contact_email: "a@acme.com" } },
  });

  it("computes monthly/one_time from the recommended scenario (setup → one-time)", async () => {
    const built = await buildProposalPayload(db, "q1", "proposal.signed");
    expect(built).not.toBeNull();
    expect(built!.tenantId).toBe("t1");
    const p = built!.payload;
    expect(p.type).toBe("proposal.signed");
    expect(p.api_version).toBe("2026-07-01");
    expect(p.data.proposal.number).toBe("PROP-2026-014");
    expect(p.data.proposal.client).toEqual({ id: "c1", company_name: "Acme", contact_email: "a@acme.com" });
    // monthly = 2×100 = 200; one_time = 1000 + (2×50 setup) = 1100
    expect(p.data.proposal.totals).toEqual({ monthly: 200, one_time: 1100, currency: "USD" });
  });

  it("returns null when the quote is missing", async () => {
    const empty = mockDb({ quotes: { single: null } });
    expect(await buildProposalPayload(empty, "nope", "proposal.sent")).toBeNull();
  });
});
