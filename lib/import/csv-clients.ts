/**
 * CSV import pipeline for clients.
 *
 * System-neutral: headers are matched case-insensitively against an alias map
 * (covering SmartProps's documented template plus common CRM export spellings).
 * Only a Company Name column is mandatory. One row = one client. Re-import
 * dedupes by company name (handled in the API route).
 */

export interface ParsedClient {
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  secondary_contact_name: string | null;
  secondary_contact_email: string | null;
  secondary_contact_phone: string | null;
  address_street: string | null;
  address_suite: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal: string | null;
  address_country: string | null;
  notes: string | null;
}

export interface CsvClientsParseResult {
  clients: ParsedClient[];
  /** Set when the file is unusable; explains what's wrong in user terms. */
  error?: string;
}

/**
 * Parses a full CSV string into rows (each row = array of field strings).
 * Handles quoted fields with commas, embedded newlines, and escaped quotes ("").
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
      if (ch === '"' && next === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { fields.push(current); current = ""; }
      else if (ch === "\r" && next === "\n") { fields.push(current); rows.push(fields); fields = []; current = ""; i++; }
      else if (ch === "\n" || ch === "\r") { fields.push(current); rows.push(fields); fields = []; current = ""; }
      else { current += ch; }
    }
  }
  if (current || fields.length > 0) {
    fields.push(current);
    if (fields.some((f) => f !== "")) rows.push(fields);
  }
  return rows;
}

// Case-insensitive header aliases: the documented template name first, then
// common spellings from HubSpot / Salesforce / QuickBooks / spreadsheet exports.
// Extend a list whenever a real-world file shows a new spelling.
const HEADER_ALIASES: Record<keyof ParsedClient, string[]> = {
  company_name:            ["company name", "company", "client name", "account name", "organization", "organisation", "business name", "name"],
  contact_name:            ["contact name", "primary contact", "contact", "full name", "contact full name"],
  contact_email:           ["contact email", "email", "primary email", "e-mail", "email address"],
  contact_phone:           ["contact phone", "phone", "primary phone", "telephone", "phone number", "mobile"],
  secondary_contact_name:  ["secondary contact name", "secondary contact", "second contact name", "secondary name", "contact 2 name", "second contact"],
  secondary_contact_email: ["secondary contact email", "secondary email", "second email", "contact 2 email", "secondary e-mail"],
  secondary_contact_phone: ["secondary contact phone", "secondary phone", "second phone", "contact 2 phone"],
  address_street:          ["street address", "address", "address line 1", "address 1", "street", "address1"],
  address_suite:           ["suite", "unit", "address line 2", "address 2", "apt", "suite/unit", "address2", "suite / unit"],
  address_city:            ["city", "town"],
  address_state:           ["state", "province", "state/province", "state / province", "region"],
  address_postal:          ["zip", "postal code", "zip code", "zip/postal", "zip / postal", "postcode", "postal"],
  address_country:         ["country"],
  notes:                   ["notes", "note", "comments", "description"],
};

export function parseClientsCsvText(csv: string): CsvClientsParseResult {
  const allRows = parseAllRows(csv);
  if (allRows.length < 2) {
    return { clients: [], error: "The file needs a header row plus at least one client row." };
  }

  const header = allRows[0].map((h) => h.trim());
  const headerNorm = header.map((h) => h.toLowerCase());
  const dataRows = allRows.slice(1);

  const idx = (field: keyof ParsedClient): number => {
    for (const alias of HEADER_ALIASES[field]) {
      const i = headerNorm.indexOf(alias);
      if (i !== -1) return i;
    }
    return -1;
  };
  const COL = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as (keyof ParsedClient)[]).map((f) => [f, idx(f)])
  ) as Record<keyof ParsedClient, number>;

  if (COL.company_name === -1) {
    return {
      clients: [],
      error:
        `Couldn't find a Company Name column. Your file's headers: ${header.filter(Boolean).join(", ") || "(none)"}. ` +
        `Expected one of: Company Name, Company, Client Name, Account Name. Tip: download the sample CSV for the full format.`,
    };
  }

  const clients: ParsedClient[] = [];
  for (const fields of dataRows) {
    const get = (col: number) => (col >= 0 ? (fields[col] ?? "").trim() : "");
    const company_name = get(COL.company_name);
    if (!company_name) continue; // blank/junk row

    clients.push({
      company_name,
      contact_name:            get(COL.contact_name) || null,
      contact_email:           get(COL.contact_email).toLowerCase() || null,
      contact_phone:           get(COL.contact_phone) || null,
      secondary_contact_name:  get(COL.secondary_contact_name) || null,
      secondary_contact_email: get(COL.secondary_contact_email).toLowerCase() || null,
      secondary_contact_phone: get(COL.secondary_contact_phone) || null,
      address_street:          get(COL.address_street) || null,
      address_suite:           get(COL.address_suite) || null,
      address_city:            get(COL.address_city) || null,
      address_state:           get(COL.address_state) || null,
      address_postal:          get(COL.address_postal) || null,
      address_country:         get(COL.address_country) || null,
      notes:                   get(COL.notes) || null,
    });
  }

  if (clients.length === 0) {
    return { clients: [], error: "No client rows found — every row was missing a Company Name." };
  }
  return { clients };
}
