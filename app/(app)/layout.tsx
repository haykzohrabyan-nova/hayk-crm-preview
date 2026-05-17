import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { IdleTimer } from "@/components/idle-timer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
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
            {children}
          </div>
        </main>
      </div>

      {/* Idle session timer — monitors inactivity, shows warning modal, auto sign-out */}
      <IdleTimer />
    </div>
  );
}
