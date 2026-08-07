// Lightweight contact typeahead for the "Link to" field on the New Task modal.
//   GET /api/contacts/search?q=<text>  → up to 10 azat.contacts matching by name
//
// Auth: same session + /tasks page-access gate as the tasks board. Reads go
// through the service-role azat-schema client (see lib/azat/server.ts).

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { requirePageAccess } from "@/lib/auth/require-page-access";
import { createAzatClient, prettyPhone } from "@/lib/azat/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContactRow = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

function displayName(c: ContactRow): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return c.name?.trim() || full || prettyPhone(c.phone) || c.email || "Unknown contact";
}

export async function GET(req: NextRequest) {
  const { userId, roleName, errorResponse } = await requireSession();
  if (errorResponse) return errorResponse;
  const deny = await requirePageAccess(userId!, roleName, "/tasks");
  if (deny) return deny;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ contacts: [] });

  const db = createAzatClient();
  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const { data, error } = await db
    .from("contacts")
    .select("id, name, first_name, last_name, phone, email")
    .or(`name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
    .order("name", { ascending: true, nullsFirst: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const contacts = ((data ?? []) as ContactRow[]).map((c) => ({
    id: c.id,
    name: displayName(c),
    subtitle: prettyPhone(c.phone) ?? c.email ?? null,
  }));

  return NextResponse.json({ contacts });
}
