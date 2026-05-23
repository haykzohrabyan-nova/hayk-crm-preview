/** Build `/quotes/new` URL with CRM customer fields pre-filled (skips Customer tab). */
export function newQuoteUrlFromCustomer(c: {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  industry?: string | null;
  website?: string | null;
}): string {
  const params = new URLSearchParams();
  if (c.id) params.set("customer_id", c.id);
  if (c.first_name) params.set("first_name", c.first_name);
  if (c.last_name) params.set("last_name", c.last_name);
  if (c.email) params.set("email", c.email);
  if (c.phone) params.set("phone", c.phone);
  if (c.company) params.set("company", c.company);
  if (c.industry) params.set("industry", c.industry);
  if (c.website) params.set("website", c.website);
  return `/quotes/new?${params.toString()}`;
}
