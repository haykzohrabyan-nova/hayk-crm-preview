/** Build Google Maps search URL for a street address. */
export function googleMapsSearchUrl(address: string): string {
  const q = address.trim();
  if (!q) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export interface CompanyAddressFields {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export function companyAddressLines(company: CompanyAddressFields): string[] {
  const cityLine = [company.city, company.state, company.zip].filter(Boolean).join(", ");
  return [company.address_line1, company.address_line2, cityLine].filter(Boolean) as string[];
}

export function companyAddressFull(company: CompanyAddressFields): string {
  return companyAddressLines(company).join(", ");
}

/** Link styling — opens maps without changing text appearance. */
export const mapLinkStyle = {
  color: "inherit",
  textDecoration: "none",
  cursor: "pointer",
} as const;

/** Public quote contact row — one line per link; hit target is text width only. */
export const publicContactLinkStyle = {
  ...mapLinkStyle,
  display: "block",
  width: "fit-content",
  maxWidth: "100%",
} as const;
