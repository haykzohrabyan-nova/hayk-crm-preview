import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => ({}));
  const { email, full_name, role_id, temp_password, send_invite_email } = body as {
    email?: string;
    full_name?: string;
    role_id?: string;
    temp_password?: string;
    send_invite_email?: boolean;
  };

  if (!email || !role_id || !temp_password) {
    return NextResponse.json(
      { error: "email, role_id, and temp_password are required.", code: "MISSING_FIELDS" },
      { status: 400 }
    );
  }
  if (temp_password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters.", code: "WEAK_PASSWORD" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Create auth user (no email sent, auto-confirmed)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: temp_password,
    email_confirm: true,
  });

  if (authError) {
    const code = authError.message.toLowerCase().includes("already")
      ? "EMAIL_EXISTS"
      : "AUTH_CREATE_FAILED";
    return NextResponse.json({ error: authError.message, code }, { status: 409 });
  }

  const userId = authData.user.id;

  // Create user profile
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .insert({
      id: userId,
      role_id,
      full_name: full_name ?? null,
      is_active: true,
      must_change_password: true,
    })
    .select("*, roles(name, display_name, is_system)")
    .single();

  if (profileError) {
    // Clean up orphaned auth user
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: profileError.message, code: "PROFILE_CREATE_FAILED" },
      { status: 500 }
    );
  }

  // Optionally send invite email
  if (send_invite_email) {
    await admin.auth.admin.inviteUserByEmail(email);
  }

  return NextResponse.json(
    { user: { ...profile, email } },
    { status: 201 }
  );
}
