import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendWelcomeEmail } from "@/lib/integrations/send-welcome-email";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: adminId, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { role_id, is_active, full_name, new_temp_password, mfa_required } = body as {
    role_id?: string;
    is_active?: boolean;
    full_name?: string;
    new_temp_password?: string;
    mfa_required?: boolean;
  };

  // Safety: admin cannot change their own role, deactivate themselves, or disable own 2FA
  if (
    id === adminId &&
    (role_id !== undefined || is_active === false || mfa_required === false)
  ) {
    return NextResponse.json(
      {
        error: "You cannot change your own role, deactivate your account, or disable your own 2FA.",
        code: "SELF_MODIFY",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Safety: cannot deactivate the last active admin
  if (is_active === false) {
    const { count } = await admin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("role_id", (
        await admin.from("roles").select("id").eq("name", "admin").single()
      ).data?.id ?? "");

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot deactivate the last active admin.", code: "LAST_ADMIN" },
        { status: 400 }
      );
    }
  }

  // Update auth password if provided
  if (new_temp_password) {
    if (new_temp_password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters.", code: "WEAK_PASSWORD" },
        { status: 400 }
      );
    }
    const { error: pwError } = await admin.auth.admin.updateUserById(id, {
      password: new_temp_password,
    });
    if (pwError) {
      return NextResponse.json({ error: pwError.message, code: "PW_UPDATE_FAILED" }, { status: 500 });
    }
  }

  // Build profile update payload
  const updates: Record<string, unknown> = {};
  if (full_name !== undefined) updates.full_name = full_name;
  if (role_id !== undefined) updates.role_id = role_id;
  if (is_active !== undefined) updates.is_active = is_active;
  if (mfa_required !== undefined) updates.mfa_required = mfa_required;
  if (new_temp_password) updates.must_change_password = true;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update.", code: "NO_CHANGES" }, { status: 400 });
  }

  const { data: profile, error: updateError } = await admin
    .from("user_profiles")
    .update(updates)
    .eq("id", id)
    .select("*, roles(name, display_name, is_system)")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message, code: "UPDATE_FAILED" }, { status: 500 });
  }

  // Get email from auth
  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const userEmail = authUser?.user?.email ?? "";

  // If a new temp password was set, email the user their new credentials.
  // Must await — fire-and-forget gets cut off when the serverless function returns on Vercel.
  let emailDelivery: { attempted: boolean; ok: boolean; error?: string; login_url?: string } | undefined;
  if (new_temp_password) {
    if (!userEmail) {
      emailDelivery = { attempted: false, ok: false, error: "User has no email address on file." };
    } else {
      const { data: companyRow } = await admin
        .from("company_settings")
        .select("company_name,logo_url,address_line1,address_line2,city,state,zip,phone,email,website")
        .eq("id", 1)
        .single();

      const result = await sendWelcomeEmail({
        fullName: profile.full_name ?? userEmail,
        email: userEmail,
        tempPassword: new_temp_password,
        company: companyRow ?? {},
        isReset: true,
        appOrigin: request.nextUrl.origin,
      });

      emailDelivery = {
        attempted: true,
        ok: result.ok,
        ...(result.loginUrl ? { login_url: result.loginUrl } : {}),
        ...(result.ok ? {} : { error: result.error }),
      };

      console.log(
        `[admin-user-reset] user ${id} (${userEmail}) — email ${result.ok ? "sent" : "failed"} — login: ${result.loginUrl ?? "n/a"}${result.error ? ` — ${result.error}` : ""}`,
      );
    }
  }

  return NextResponse.json({
    user: { ...profile, email: userEmail },
    ...(emailDelivery ? { email_delivery: emailDelivery } : {}),
  });
}
