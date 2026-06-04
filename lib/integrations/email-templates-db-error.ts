/** PostgREST error when `email_templates` migration has not been applied yet. */
export function isMissingEmailTemplatesTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    (msg.includes("email_templates") && msg.includes("schema cache"))
  );
}

export const EMAIL_TEMPLATES_MIGRATION_HINT =
  "Run supabase/schema.sql in the Supabase SQL Editor (or apply the email_templates section on your database), then reload this page.";
