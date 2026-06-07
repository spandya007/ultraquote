/**
 * CSV import pipeline for Zomentum product export.
 *
 * Groups rows by zomentum_id — each unique ID becomes one product,
 * with one pricing tier per row (Pricing Name / Sell Price / Cost Price).
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
  zomentum_id: string;
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
  const t = raw.trim();
  if (t === "Service") return "Service";
  if (t === "Hardware") return "Hardware";
  if (t === "Software") return "Software";
  return "Other";
}

function normaliseBillingPeriod(raw: string): ParsedProduct["billing_period"] {
  const t = raw.trim();
  if (t === "Monthly") return "Monthly";
  if (t === "One Time") return "One Time";
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

/**
 * Parses the Zomentum CSV export text into structured products.
 * Handles quoted fields containing commas and embedded newlines.
 */
export function parseCsvText(csv: string): ParsedProduct[] {
  const allRows = parseAllRows(csv);
  if (allRows.length < 2) return [];

  const header = allRows[0].map((h) => h.trim());
  const dataRows = allRows.slice(1);

  const idx = (name: string) => header.indexOf(name);
  const COL = {
    zomentum_id:         idx("Zomentum Id"),
    name:                idx("Item Name"),
    item_type:           idx("Item Type"),
    description:         idx("Item Description"),
    pricing_name:        idx("Pricing Name"),
    pricing_description: idx("Pricing Description"),
    billing_period:      idx("Billing Period"),
    unit_cost:           idx("Cost Price"),
    unit_price:          idx("Sell Price"),
    setup_price:         idx("Setup Price"),
    product_category:    idx("Product Category"),
    manufacturer:        idx("Manufacturer"),
    manufacturer_part_no:idx("Manufacturer Part No."),
    supplier_name:       idx("Supplier Name"),
    supplier_sku:        idx("Supplier SKU"),
    autotask_id:         idx("Autotask ID"),
    quickbooks_online_id:idx("Quickbooks Online ID"),
  };

  const productMap = new Map<string, ParsedProduct>();

  for (const fields of dataRows) {
    const get = (col: number) => (fields[col] ?? "").trim();

    const zomentum_id = get(COL.zomentum_id);
    if (!zomentum_id) continue;

    const tierName = get(COL.pricing_name) || "Default Pricing";
    const tierCost = parseNum(get(COL.unit_cost));
    const tierPrice = parseNum(get(COL.unit_price));
    const tierDesc = get(COL.pricing_description) || null;

    if (!productMap.has(zomentum_id)) {
      productMap.set(zomentum_id, {
        zomentum_id,
        name:                get(COL.name),
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

    const product = productMap.get(zomentum_id)!;
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

  return Array.from(productMap.values());
}
