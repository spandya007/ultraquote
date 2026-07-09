// Shared client-address helper. Composes the structured address (migration 027)
// into a display string, falling back to the legacy free-text `address` column
// when no structured fields are set — so older records keep working.

export interface AddressParts {
  address_street?: string | null;
  address_suite?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal?: string | null;
  address_country?: string | null;
  address?: string | null;
}

/**
 * Compose a single-line address from the structured fields, else the legacy
 * free-text `address`. `sep` joins the logical lines (street / city-state-zip /
 * country) — default ", " for inline use; pass "\n" for a stacked block.
 */
export function composeAddress(c: AddressParts, sep = ", "): string {
  const line1 = [c.address_street, c.address_suite].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  const cityState = [c.address_city, c.address_state].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
  const cityLine = [cityState, (c.address_postal ?? "").trim()].filter(Boolean).join(" ");
  const parts = [line1, cityLine, (c.address_country ?? "").trim()].map((s) => s.trim()).filter(Boolean);
  if (parts.length) return parts.join(sep);
  return (c.address ?? "").trim();
}

/** True when any structured address field is populated. */
export function hasStructuredAddress(c: AddressParts): boolean {
  return !!(c.address_street || c.address_suite || c.address_city || c.address_state || c.address_postal || c.address_country);
}
