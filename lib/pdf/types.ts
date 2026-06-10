// Shared data shapes for the PDF/Preview serializer.
// Kept framework-agnostic so the serializer runs both in Next.js routes and in
// the standalone Puppeteer service.

export interface SerializeClient {
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  logo_url: string | null;
}

export interface SerializeTenant {
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
}

export interface SerializeLineItem {
  description: string;
  billing_period: "Monthly" | "One Time" | null;
  quantity: number;
  unit_price: number | null;
  is_taxable: boolean;
  discount_percent: number | null;
  discount_amount: number | null;
}

export interface SerializeScenario {
  id: string;
  name: string;
  is_recommended: boolean;
  sort_order: number;
  line_items: SerializeLineItem[];
}

export interface SerializeQuote {
  quote_number: string;
  title: string | null;
  valid_until: string | null;
  tax_rate: number | null;
  payment_terms: string | null;
}

// A BlockNote block (loosely typed — we only read the fields we render).
export interface DocBlock {
  id?: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props?: Record<string, any>;
  content?: InlineContent[] | string;
  children?: DocBlock[];
}

export interface InlineContent {
  type: string;            // "text" | "link" | ...
  text?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  styles?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content?: any;           // for links
  href?: string;
}

export interface SerializeInput {
  quote: SerializeQuote;
  blocks: DocBlock[];
  scenarios: SerializeScenario[];
  client: SerializeClient;
  tenant: SerializeTenant;
  /** Maps `sb-storage://bucket/path` → signed https URL (pre-resolved by caller). */
  imageUrlMap?: Record<string, string>;
  /** When true, signature-field blocks emit DocuSeal field tags (for /submissions/html)
   *  instead of a plain signature line. */
  forSigning?: boolean;
}
