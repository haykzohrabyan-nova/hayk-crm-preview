// Hayk 2026-07-01 — Preview layout wrapper.
// Injects the floating Ask AI widget onto every /preview/* page.
// Hayk 2026-07-02 — Also injects the role-view picker + banner so every
// preview page can be viewed from any team member's eyes.
// Real routes are untouched.

import AskAiWidget from "./_shared/AskAiWidget";
import { FloatingRolePicker } from "./_shared/RolePicker";
import { PreviewRoleBanner } from "./_shared/PreviewRoleBanner";

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PreviewRoleBanner />
      {children}
      <FloatingRolePicker />
      <AskAiWidget />
    </>
  );
}
