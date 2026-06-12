/**
 * CSV import pipeline for product catalogs.
 *
 * System-neutral: headers are matched case-insensitively against an alias map
 * (covering UltraQuote's documented template plus common Zomentum / Autotask /
 * ConnectWise / QuickBooks export spellings). Only a product-name column is
 * mandatory. Rows are grouped into one product with one pricing tier per row —
 * by `Zomentum Id` when that (undocumented, legacy) column is present,
 * otherwise by product name.
 */

export interface CsvProductRow {
  zomentum_id: string;
  name: string;
  item_type: string;
  description: string;
  pricing_name: string;
  pricing_description: string;
  billing_period: string;
  unit_cost: number;
  unit_price: number;
  setup_price: number;
  product_number: string;
  product_category: string;
  manufacturer: string;
  manufacturer_part_no: string;
  supplier_name: string;
  supplier_sku: string;
  autotask_id: string;
  quickbooks_online_id: string;
}

export interface ParsedProduct {
  zomentum_id: string | null;
  name: string;
  item_type: "Service" | "Hardware" | "Software" | "Other" | null;
  description: string | null;
  billing_period: "Monthly" | "One Time" | null;
  unit_cost: number | null;
  unit_price: number | null;
  setup_price: number;
  product_category: string | null;
  manufacturer: string | null;
  manufacturer_part_no: string | null;
  supplier_name: string | null;
  supplier_sku: string | null;
  autotask_id: string | null;
  quickbooks_online_id: string | null;
  pricing_tiers: ParsedPricingTier[];
}

export interface ParsedPricingTier {
  tier_name: string;
  description: string | null;
  unit_cost: number | null;
  unit_price: number | null;
  is_default: boolean;
  sort_order: number;
}

function normaliseItemType(raw: string): ParsedProduct["item_type"] {
  const t = raw.trim().toLowerCase();
  if (t === "service") return "Service";
  if (t === "hardware") return "Hardware";
  if (t === "software") return "Software";
  return "Other";
}

function normaliseBillingPeriod(raw: string): ParsedProduct["billing_period"] {
  const t = raw.trim().toLowerCase();
  if (["monthly", "recurring", "per month", "month"].includes(t)) return "Monthly";
  if (["one time", "one-time", "onetime", "once", "non-recurring", "nonrecurring"].includes(t)) return "One Time";
  return null;
}

function parseNum(raw: string): number | null {
  const n = parseFloat(raw);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

/**
 * Parses a full CSV string into an array of rows (each row = array of field strings).
 * Correctly handles:
 *  - Quoted fields containing commas
 *  - Quoted fields containing embedded newlines (multi-line descriptions)
 *  - Escaped double-quotes ("")
 */
function parseAllRows(csv: string): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;
  const n = csv.length;

  for (let i = 0; i < n; i++) {
    const ch = csv[i];
    const next = csv[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else if (ch === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        // Any character inside quotes (including \n) is part of the field
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = "";
      } else if (ch === '\r' && next === '\n') {
        // Windows CRLF — end of row
        fields.push(current);
        rows.push(fields);
        fields = [];
        current = "";
        i++; // skip \n
      } else if (ch === '\n' || ch === '\r') {
        // Unix LF / old Mac CR — end of row
        fields.push(current);
        rows.push(fields);
        fields = [];
        current = "";
      } else {
        current += ch;
      }
    }
  }

  // Flush last field/row
  if (current || fields.length > 0) {
    fields.push(current);
    if (fields.some(f => f !== "")) rows.push(fields);
  }

  return rows;
}

// Case-insensitive header aliases: the documented template name first, then
// common spellings from Zomentum / Autotask / ConnectWise / QuickBooks / Syncro
// exports. Extend a list whenever a real-world file shows a new spelling.
const HEADER_ALIASES: Record<string, string[]> = {
  name:                ["item name", "name", "product name", "item", "product/service name", "item id"],
  item_type:           ["item type", "type", "product type", "product class"],
  description:         ["item description", "description", "sales description"],
  pricing_name:        ["pricing name", "tier name", "pricing tier"],
  pricing_description: ["pricing description", "tier description"],
  billing_period:      ["billing period", "billing", "billing frequency", "frequency"],
  unit_cost:           ["cost price", "cost", "unit cost"],
  unit_price:          ["sell price", "price", "unit price", "sales price", "rate"],
  setup_price:         ["setup price", "setup fee", "onboarding fee"],
  product_category:    ["product category", "category", "subcategory"],
  manufacturer:        ["manufacturer"],
  manufacturer_part_no:["manufacturer part no.", "manufacturer part no", "manufacturer product number", "mpn", "part number"],
  supplier_name:       ["supplier name", "vendor", "supplier"],
  supplier_sku:        ["supplier sku", "sku", "product sku"],
  autotask_id:         ["autotask id"],
  quickbooks_online_id:["quickbooks online id", "quickbooks id", "qbo id"],
  // Legacy/internal — honored when present, never documented externally.
  zomentum_id:         ["zomentum id"],
};

export interface CsvParseResult {
  products: ParsedProduct[];
  /** Set when the file is unusable; explains what's wrong in user terms. */
  error?: string;
}

/**
 * Parses product-catalog CSV text into structured products.
 * Handles quoted fields containing commas and embedded newlines.
 * Only a product-name column is mandatory; see HEADER_ALIASES.
 */
export function parseCsvText(csv: string): CsvParseResult {
  const allRows = parseAllRows(csv);
  if (allRows.length < 2) {
    return { products: [], error: "The file needs a header row plus at least one product row." };
  }

  const header = allRows[0].map((h) => h.trim());
  const headerNorm = header.map((h) => h.toLowerCase());
  const dataRows = allRows.slice(1);

  const idx = (field: string): number => {
    for (const alias of HEADER_ALIASES[field]) {
      const i = headerNorm.indexOf(alias);
      if (i !== -1) return i;
    }
    return -1;
  };
  const COL = Object.fromEntries(Object.keys(HEADER_ALIASES).map((f) => [f, idx(f)])) as Record<
    keyof typeof HEADER_ALIASES,
    number
  >;

  if (COL.name === -1) {
    return {
      products: [],
      error:
        `Couldn't find a product-name column. Your file's headers: ${header.filter(Boolean).join(", ") || "(none)"}. ` +
        `Expected one of: Item Name, Product Name, Name. Tip: download the sample CSV for the full format.`,
    };
  }

  const productMap = new Map<string, ParsedProduct>();

  for (const fields of dataRows) {
    const get = (col: number) => (col >= 0 ? (fields[col] ?? "").trim() : "");

    const name = get(COL.name);
    if (!name) continue; // blank/junk row

    // Rows sharing a key merge into one product (one pricing tier per row).
    // Prefer the legacy Zomentum Id when that column exists; otherwise the name.
    const zomentum_id = get(COL.zomentum_id) || null;
    const groupKey = zomentum_id ? `z:${zomentum_id}` : `n:${name.toLowerCase()}`;

    const tierName = get(COL.pricing_name) || "Default Pricing";
    const tierCost = parseNum(get(COL.unit_cost));
    const tierPrice = parseNum(get(COL.unit_price));
    const tierDesc = get(COL.pricing_description) || null;

    if (!productMap.has(groupKey)) {
      productMap.set(groupKey, {
        zomentum_id,
        name,
        item_type:           normaliseItemType(get(COL.item_type)),
        description:         get(COL.description) || null,
        billing_period:      normaliseBillingPeriod(get(COL.billing_period)),
        unit_cost:           tierCost,
        unit_price:          tierPrice,
        setup_price:         parseNum(get(COL.setup_price)) ?? 0,
        product_category:    get(COL.product_category) || null,
        manufacturer:        get(COL.manufacturer) || null,
        manufacturer_part_no:get(COL.manufacturer_part_no) || null,
        supplier_name:       get(COL.supplier_name) || null,
        supplier_sku:        get(COL.supplier_sku) || null,
        autotask_id:         get(COL.autotask_id) || null,
        quickbooks_online_id:get(COL.quickbooks_online_id) || null,
        pricing_tiers: [],
      });
    }

    const product = productMap.get(groupKey)!;
    const isDefault =
      tierName.toLowerCase().includes("default") ||
      product.pricing_tiers.length === 0;

    // Avoid duplicate tiers
    const alreadyExists = product.pricing_tiers.some(
      (t) => t.tier_name === tierName
    );
    if (!alreadyExists) {
      product.pricing_tiers.push({
        tier_name:   tierName,
        description: tierDesc,
        unit_cost:   tierCost,
        unit_price:  tierPrice,
        is_default:  isDefault,
        sort_order:  product.pricing_tiers.length,
      });
    }
  }

  if (productMap.size === 0) {
    return {
      products: [],
      error: "No product rows found — every row was missing a product name.",
    };
  }

  return { products: Array.from(productMap.values()) };
}
