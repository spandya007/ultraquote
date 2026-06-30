import type { SerializeInput, SerializeLineItem, SerializeScenario } from "@/lib/pdf/types";
import { formatCurrency } from "@/lib/utils/format";

// Renders a quote's STRUCTURED data (client, your company, scenarios + line items
// + totals) as compact Markdown for grounding the AI draft. The model speaks to
// this scope but must not restate the figures — the live pricing table block
// remains the source of truth in the Document (see /api/ai/draft guardrails).

// Discounted line revenue (mirrors the serializer's lineRevenue: % or $ off the
// qty×unit price, floored at 0). Setup is a separate one-time charge, not discounted.
function lineRevenue(li: SerializeLineItem): number {
  const base = (li.unit_price ?? 0) * (li.quantity ?? 0);
  let net = base;
  if (li.discount_percent) net = base * (1 - li.discount_percent / 100);
  else if (li.discount_amount) net = base - li.discount_amount;
  return Math.max(0, net);
}
const lineSetup = (li: SerializeLineItem): number => (li.setup_price ?? 0) * (li.quantity ?? 0);

function scenarioMarkdown(s: SerializeScenario): string {
  const header = `### ${s.name}${s.is_recommended ? " (recommended)" : ""}`;
  const items = s.line_items ?? [];
  if (items.length === 0) return `${header}\n_(no line items)_`;

  const rows = items.map((li) => {
    const period = li.billing_period === "One Time" ? "one-time" : "monthly";
    const setup = lineSetup(li);
    return `| ${li.description || "—"} | ${li.quantity ?? 0} | ${period} | ${formatCurrency(
      li.unit_price ?? 0
    )} | ${setup ? formatCurrency(setup) + " setup" : "—"} |`;
  });

  let monthly = 0;
  let oneTime = 0;
  for (const li of items) {
    if (li.billing_period === "One Time") oneTime += lineRevenue(li);
    else monthly += lineRevenue(li);
    oneTime += lineSetup(li); // setup is always a one-time charge
  }

  return [
    header,
    "| Service | Qty | Billing | Unit price | Setup |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    `Monthly recurring: ${formatCurrency(monthly)} · One-time: ${formatCurrency(oneTime)}`,
  ].join("\n");
}

export function quoteContextMarkdown(input: SerializeInput): string {
  const { client, tenant, scenarios } = input;
  const parts: string[] = [];

  parts.push(
    `## Client\n${client.company_name || "—"}${client.contact_name ? ` — ${client.contact_name}` : ""}${
      client.contact_email ? ` (${client.contact_email})` : ""
    }`
  );
  parts.push(`## Your company\n${tenant.name || "—"}`);

  const ordered = [...scenarios].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (ordered.length) {
    parts.push(
      "## Scenarios & pricing\n_(Do not restate these numbers in prose — the proposal's pricing table shows them. Speak to the scope and value.)_\n\n" +
        ordered.map(scenarioMarkdown).join("\n\n")
    );
  }

  return parts.join("\n\n");
}
