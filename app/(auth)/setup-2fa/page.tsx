"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/auth/safe-return-path";
import { isMfaRequired } from "@/lib/auth/mfa-required";
import { maybeCreateMfaTrustAfterVerify } from "@/lib/auth/remember-mfa-client";
import { OtpInput } from "@/components/auth/otp-input";

function Setup2FAForm() {
  const searchParams = useSearchParams();
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(true);
  const enrolledRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Auto-submit when all 6 digits are entered
  useEffect(() => {
    if (code.length === 6 && factorId && !loading) {
      formRef.current?.requestSubmit();
    }
  }, [code, factorId, loading]);

  useEffect(() => {
    // Guard against React StrictMode double-invoke in development.
    if (enrolledRef.current) return;
    enrolledRef.current = true;

    async function enroll() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      let profile: { mfa_required?: boolean | null; full_name?: string | null } | null = null;

      if (user) {
        const { data: profileRow } = await supabase
          .from("user_profiles")
          .select("mfa_required, full_name")
          .eq("id", user.id)
          .single();
        profile = profileRow;

        if (!isMfaRequired(profile)) {
          const next = safeReturnPath(searchParams.get("next")) ?? "/dashboard";
          window.location.assign(next);
          return;
        }
      }

      const accountName =
        profile?.full_name?.trim() || user?.email?.split("@")[0] || "User";

      // Remove all existing TOTP factors before re-enrolling.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.totp ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        // Millisecond timestamp guarantees a unique name every enrollment attempt.
        friendlyName: `BazarCRM-${Date.now()}`,
      });
      if (enrollError || !data) {
        setError(enrollError?.message ?? "Failed to start MFA enrollment.");
        setEnrollLoading(false);
        return;
      }
      // Build a minimal otpauth URI from the secret.
      // Supabase's full qr_code URI can exceed QR code data limits; the short form
      // is universally supported by all authenticator apps.
      const issuer = "BazaarPrinting";
      const label = encodeURIComponent(`${issuer}:${accountName}`);
      const shortUri = `otpauth://totp/${label}?secret=${data.totp.secret}&issuer=${encodeURIComponent(issuer)}`;
      setFactorId(data.id);
      setQrUri(shortUri);
      setSecret(data.totp.secret);
      setEnrollLoading(false);
    }
    enroll();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length < 6) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setError(challengeError?.message ?? "Challenge failed.");
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError(verifyError.message);
      setCode("");
      setLoading(false);
      return;
    }

    await supabase.auth.refreshSession();
    await maybeCreateMfaTrustAfterVerify();
    const next = safeReturnPath(searchParams.get("next")) ?? "/dashboard";
    window.location.assign(next);
  }

  return (
    <div
      className="w-full rounded-[10px] border px-10 py-9"
      style={{
        maxWidth: 440,
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}
    >
      {/* Step dots */}
      <div className="flex items-center justify-center gap-2 mb-7">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-success)" }} />
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: "var(--color-topbar)" }}
        >
          <KeyRound className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        </div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Set up two-factor authentication
        </h1>
        <p className="mt-1.5 text-[13px] italic" style={{ color: "var(--color-text-muted)" }}>
          Scan the QR code with your authenticator app
        </p>
      </div>

      {/* QR Code */}
      {enrollLoading ? (
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="skeleton h-[196px] w-[196px] rounded-lg" />
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Generating QR code…
          </p>
        </div>
      ) : qrUri ? (
        <div className="mb-6 flex flex-col items-center gap-4">
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={qrUri} size={180} level="L" />
          </div>
          {secret && (
            <div className="w-full">
              <p
                className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.06em]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Manual entry key
              </p>
              <code
                className="block w-full break-all rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed select-all"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                }}
              >
                {secret}
              </code>
            </div>
          )}
        </div>
      ) : null}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border px-3.5 py-2.5 text-xs font-medium"
          style={{
            backgroundColor: "var(--color-danger-bg)",
            borderColor: "var(--color-danger-border)",
            color: "var(--color-danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* OTP + submit */}
      {!enrollLoading && (
        <form ref={formRef} onSubmit={handleVerify} className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label
              className="text-center text-[12px] font-medium uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              Verification code
            </label>
            <OtpInput value={code} onChange={setCode} />
          </div>

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="h-10 w-full rounded-md text-[13px] font-medium transition-all active:scale-[0.97] disabled:opacity-60"
            style={{
              backgroundColor: "var(--color-btn-primary-bg)",
              color: "var(--color-btn-primary-text)",
            }}
            onMouseEnter={(e) => { if (code.length === 6 && !loading) (e.currentTarget as HTMLButtonElement).style.opacity = "0.9"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
          >
            {loading ? "Enabling…" : "Enable 2FA"}
          </button>
        </form>
      )}

      {/* Security badge */}
      <div className="mt-5 flex items-center justify-center gap-1.5">
        <ShieldCheck className="h-3 w-3" style={{ color: "var(--color-success)" }} />
        <span className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
          2-factor verification active after setup
        </span>
      </div>
    </div>
  );
}

export default function Setup2FAPage() {
  return (
    <Suspense>
      <Setup2FAForm />
    </Suspense>
  );
}
