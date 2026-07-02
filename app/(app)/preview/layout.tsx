// Hayk 2026-07-01 — Preview layout wrapper.
// Injects the floating Ask AI widget onto every /preview/* page.
// Real routes are untouched.

import AskAiWidget from "./_shared/AskAiWidget";

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AskAiWidget />
    </>
  );
}
