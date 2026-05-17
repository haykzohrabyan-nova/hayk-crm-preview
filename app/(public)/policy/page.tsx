import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Security & Privacy Policy — BazaarPrinting CRM",
};

export default function PolicyPage() {
  return (
    <div
      className="min-h-screen py-12 px-4"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: "var(--color-topbar)" }}
          >
            <ShieldCheck className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <p
              className="text-[11px] font-medium uppercase tracking-[0.08em] mb-0.5"
              style={{ color: "var(--color-text-muted)" }}
            >
              BazaarPrinting CRM
            </p>
            <h1
              className="text-[22px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Security &amp; Privacy Policy
            </h1>
          </div>
        </div>

        <div
          className="rounded-[12px] border p-6 sm:p-8 space-y-6"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >

          {/* Section 1 */}
          <section className="space-y-2">
            <h2
              className="text-[13px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              1. Session Management
            </h2>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              BazaarPrinting CRM automatically signs you out after a period of inactivity. This
              protects client data if you step away from your computer and leave the app open.
            </p>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              Before signing you out, the system displays a warning with a countdown timer. You can
              click <strong style={{ fontWeight: 500 }}>"Stay Signed In"</strong> at any time to
              reset the timer. The inactivity timeout is configured by your administrator and may
              vary.
            </p>
          </section>

          {/* Section 2 */}
          <div className="border-t" style={{ borderColor: "var(--color-border)" }} />
          <section className="space-y-2">
            <h2
              className="text-[13px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              2. Session Logging
            </h2>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              Each time you sign in and out of the CRM, the following information is recorded:
            </p>
            <ul
              className="list-disc list-inside space-y-1 text-[14px] leading-relaxed pl-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              <li>The date and time you signed in</li>
              <li>The date and time you signed out</li>
              <li>How the session ended — manually (you clicked Sign Out) or automatically (idle timeout)</li>
            </ul>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              This information is used to ensure the security of the platform and to give
              administrators visibility into system access.
            </p>
          </section>

          {/* Section 3 */}
          <div className="border-t" style={{ borderColor: "var(--color-border)" }} />
          <section className="space-y-2">
            <h2
              className="text-[13px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              3. What Administrators Can See
            </h2>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              Administrators can view the session history for all users in the system, including:
            </p>
            <ul
              className="list-disc list-inside space-y-1 text-[14px] leading-relaxed pl-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              <li>Total sessions per user in a given period</li>
              <li>Total active time (time spent signed in)</li>
              <li>Number of automatic sign-outs due to inactivity</li>
              <li>The most recent sign-in time for each user</li>
            </ul>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              This data is only accessible to users with the Administrator role. It is not shared
              with any third party.
            </p>
          </section>

          {/* Section 4 */}
          <div className="border-t" style={{ borderColor: "var(--color-border)" }} />
          <section className="space-y-2">
            <h2
              className="text-[13px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              4. Data Retention
            </h2>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              Session records are stored in the BazaarPrinting CRM database hosted on Supabase. No
              session data is transmitted to external services. Records are retained for the lifetime
              of the user account.
            </p>
          </section>

          {/* Section 5 */}
          <div className="border-t" style={{ borderColor: "var(--color-border)" }} />
          <section className="space-y-2">
            <h2
              className="text-[13px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: "var(--color-text-muted)" }}
            >
              5. Questions
            </h2>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
              If you have questions about this policy or how your session data is used, please speak
              with your system administrator.
            </p>
          </section>

        </div>

        {/* Footer */}
        <p
          className="text-center text-[12px] mt-6"
          style={{ color: "var(--color-text-muted)" }}
        >
          BazaarPrinting CRM · Internal use only
        </p>

      </div>
    </div>
  );
}
