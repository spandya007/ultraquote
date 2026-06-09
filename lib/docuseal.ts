// Thin DocuSeal API client (cloud). Docs: https://www.docuseal.com/docs/api

const BASE = process.env.DOCUSEAL_BASE_URL || "https://api.docuseal.com";

export function docusealConfigured(): boolean {
  return !!process.env.DOCUSEAL_API_TOKEN;
}

export interface DocusealSubmitter {
  role: string;            // matches the role= in the HTML field tags
  email: string;
  name?: string;
  /** Signing order; same number = parallel signing. Defaults to array index. */
  order?: number;
}

/**
 * Creates a submission from HTML content (with {{Field;role=...;type=...}} tags)
 * and emails the signers. Submitters are ordered sequentially (index = order),
 * so the second party counter-signs after the first completes.
 * Returns the raw response (array of submitter objects, each with submission_id).
 */
export async function createHtmlSubmission(opts: {
  name: string;
  html: string;
  submitters: DocusealSubmitter[];
  /** Custom notification email. Body may use {{submitter.link}} (the signing link),
   *  {{submission.name}}, {{account.name}}. */
  message?: { subject: string; body: string };
  replyTo?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<any> {
  const res = await fetch(`${BASE.replace(/\/$/, "")}/submissions/html`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": process.env.DOCUSEAL_API_TOKEN as string,
    },
    body: JSON.stringify({
      name: opts.name,
      send_email: true,
      ...(opts.message ? { message: opts.message } : {}),
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      // NOTE: the /submissions/html endpoint takes the markup under `html`
      // (`file` is for the PDF/DOCX endpoints — using it yields a BLANK document).
      documents: [{ name: opts.name, html: opts.html }],
      submitters: opts.submitters.map((s, i) => ({
        role: s.role, email: s.email, name: s.name, order: s.order ?? i,
      })),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DocuSeal error ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}
