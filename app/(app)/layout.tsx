import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { IdleTimer } from "@/components/layout/idle-timer";
import { ErrorBoundary } from "@/components/layout/error-boundary";
import { AppSessionProvider } from "@/components/layout/app-session-provider";
import { SentryUserIdentity } from "@/components/layout/sentry-user-identity";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppSessionProvider>
      <SentryUserIdentity />
    <div className="flex h-svh overflow-hidden" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Desktop sidebar — hidden below lg breakpoint */}
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar />
      </div>

      {/* Right column: mobile header + page content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar + slide-in drawer — hidden at lg and above */}
        <MobileNav />

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1980px] px-4 py-6 lg:px-6">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Idle session timer — monitors inactivity, shows warning modal, auto sign-out */}
      <IdleTimer />
    </div>
    </AppSessionProvider>
  );
}
