"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@/lib/supabase/client";
import { safeReturnPath } from "@/lib/auth/safe-return-path";

function Setup2FAForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(true);

  useEffect(() => {
    async function enroll() {
      const supabase = createClient();

      // Clean up any stale unverified TOTP factors before enrolling fresh.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const unverified = existing?.totp?.filter((f) => f.status === "unverified") ?? [];
      await Promise.all(unverified.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "BazarCRM Authenticator",
      });
      if (enrollError || !data) {
        setError(enrollError?.message ?? "Failed to start MFA enrollment.");
        setEnrollLoading(false);
        return;
      }
      setFactorId(data.id);
      setQrUri(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrollLoading(false);
    }
    enroll();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
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
      setLoading(false);
      return;
    }

    // Refresh session so cookies reflect AAL2 before proxy.ts runs
    await supabase.auth.refreshSession();
    const next = safeReturnPath(searchParams.get("next")) ?? "/dashboard";
    window.location.assign(next);
  }

  return (
    <div
      className="rounded-xl border p-8 shadow-sm"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}
    >
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: "var(--foreground)" }}>
          Set up two-factor authentication
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
          Scan the QR code with your authenticator app, then enter the 6-digit code.
        </p>
      </div>

      {enrollLoading && (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Generating QR code…
        </p>
      )}

      {!enrollLoading && qrUri && (
        <div className="mb-6 flex flex-col items-center gap-4">
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={qrUri} size={180} level="M" />
          </div>
          {secret && (
            <div className="w-full">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Manual entry key
              </p>
              <code
                className="block w-full break-all rounded-md border px-3 py-2 font-mono text-xs"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)" }}
              >
                {secret}
              </code>
            </div>
          )}
        </div>
      )}

      {!enrollLoading && (
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="totp-code"
              className="text-sm font-medium"
              style={{ color: "var(--foreground)" }}
            >
              Verification code
            </label>
            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="rounded-md border px-3 py-2 text-center font-mono text-lg tracking-widest outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-1"
              style={{
                borderColor: "var(--input)",
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
              }}
              placeholder="000000"
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-60"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            {loading ? "Verifying…" : "Enable 2FA"}
          </button>
        </form>
      )}
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
