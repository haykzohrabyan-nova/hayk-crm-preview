# Changelog

All notable changes to BazaarPrinting CRM are documented here.
Format: `## [version or date] — description`, newest first.

---

## [2026-05-06] — Auth UX polish & sign-out

### Added
- Auto-submit on 6th digit in `/verify-2fa` — no button press needed
- Wrong code: clears all 6 boxes and shows "Incorrect code — please try again."
- Sign out logic wired in desktop sidebar and mobile nav drawer (calls `supabase.auth.signOut()` then `window.location.assign("/login")`)

---

## [2026-05-06] — Auth pages redesigned

### Added
- `components/otp-input.tsx` — reusable 6-box OTP input with auto-advance on input, backspace navigation, and full paste support

### Changed
- `app/(auth)/login/page.tsx` — full redesign: navy lock icon header, italic subtitle, uppercase labels, show/hide password toggle, step dots, security badge. Removed "Forgot password?" and "Remember device" (not needed for internal tool)
- `app/(auth)/verify-2fa/page.tsx` — 6-box OTP grid replacing single input field; info box; step dots (step 1 green = done, step 2 gold = active); "Use a different account" link
- `app/(auth)/setup-2fa/page.tsx` — matching card style, skeleton loader while QR generates, manual key display, 6-box OTP input

---

## [2026-05-06] — QR code fixes

### Fixed
- Replaced `react-qr-code` with `qrcode.react` — `react-qr-code` threw "code length overflow" on Supabase TOTP URIs
- Switched QR error correction from `level="M"` to `level="L"` for higher data capacity
- Replaced Supabase's full `qr_code` URI with a minimal `otpauth://totp/BazaarPrinting?secret=...` URI — Supabase's URI was too long for any QR library level
- Added `useRef` guard to prevent React StrictMode double-invoke causing duplicate enrollment calls
- Changed TOTP friendly name to `BazarCRM-{timestamp}` — prevents "factor name conflict" 422 error on re-enrollment

---

## [2026-05-06] — Navigation & mobile nav

### Added
- `components/mobile-nav.tsx` — mobile top bar (56px, navy) with hamburger button; full-height slide-in drawer with nav items, dark mode toggle, sign out; closes on route change; locks body scroll while open

### Changed
- `app/(app)/layout.tsx` — sidebar hidden below `lg` breakpoint; mobile nav shown on mobile only; page padding `px-4` mobile / `px-6` desktop

---

## [2026-05-06] — Sidebar navigation

### Changed
- Navigation switched from horizontal tab bar to **collapsible left sidebar** matching Pulse V2 pattern
- `components/sidebar.tsx` — navy background (`var(--color-topbar)`), expanded 224px / collapsed 56px, active item uses gold/orange accent, collapse state persisted in `localStorage` key `bazaar-sidebar-collapsed`, dark mode toggle + sign out + collapse button at bottom
- `app/(app)/layout.tsx` — uses sidebar instead of topbar + tab nav
- Removed old `components/sidebar.tsx` and `components/mobile-nav.tsx` (horizontal tab versions)
- Updated `.cursor/rules/ui-design-system.mdc` to reflect sidebar layout

---

## [2026-05-06] — BazaarPrinting UI design system applied

### Added
- `components/topbar.tsx` — navy/charcoal topbar, gold/orange `BAZAARPRINTING CRM` logo, theme toggle
- `components/tab-nav.tsx` — horizontal tab bar with active gold/orange underline, count badge support

### Changed
- `app/globals.css` — replaced generic Tailwind variables with full BazaarPrinting token set (19 CSS variables, light + dark), skeleton shimmer animation
- `app/layout.tsx` — font swapped Roboto → **Inter**; `NextTopLoader` uses `var(--color-accent)`
- `components/theme-provider.tsx` — localStorage key changed from `bazar-crm-theme` to `bazaar-theme`
- `.cursor/rules/ui-design-system.mdc` — updated to reflect new nav layout

---

## [2026-05-06] — Cursor rules created

### Added
- `.cursor/rules/stack-conventions.mdc` — stack rules (always applied): Next.js 16 proxy.ts pattern, Supabase client split, env var rules
- `.cursor/rules/ui-design-system.mdc` — BazaarPrinting design system (always applied): full color token table, typography, layout rules, component specs, do/don'ts

---

## [2026-05-06] — Vercel deployment fixes

### Added
- `vercel.json` — sets `framework: nextjs` to fix "No Output Directory named public" error
- `package.json` `engines` field — requires `node >=18.18.0` for Next.js 16 compatibility

### Fixed
- Vercel was treating project as static site instead of Next.js app

---

## [2026-05-06] — Supabase + local dev setup

### Added
- `.env.local` — local Supabase credentials (gitignored)
- Auth bypass in `proxy.ts` — skips auth when `NEXT_PUBLIC_SUPABASE_URL` is empty, enabling UI-only local dev without Supabase

### Configured (Supabase dashboard)
- Email signup: disabled
- Confirm email: disabled  
- TOTP MFA: enabled
- Site URL + redirect URLs added for Vercel domain and localhost

---

## [2026-05-06] — Initial scaffold

### Added
- `package.json` — Next.js 16, React 19, TypeScript 5, Tailwind CSS v4, Supabase SSR, shadcn, lucide-react, qrcode.react, nextjs-toploader, tw-animate-css
- `tsconfig.json` — strict mode, path alias `@/*` → project root
- `next.config.ts`, `postcss.config.mjs`, `components.json` (shadcn, style: base-nova)
- `.gitignore`, `.env.local.example`
- `proxy.ts` — Next.js 16 Proxy, AAL2 session enforcement, MFA redirect logic (adapted from Pulse V2)
- `lib/supabase/client.ts` — browser Supabase client
- `lib/supabase/admin.ts` — service-role client (server/Route Handlers only)
- `lib/auth/safe-return-path.ts` — open redirect prevention
- `lib/auth/resolve-default-home.ts` — default post-login path (`/dashboard`)
- `lib/utils.ts` — `cn()` helper
- `app/globals.css`, `app/layout.tsx`, `app/page.tsx` (redirects → `/dashboard`)
- `app/(auth)/layout.tsx`, `login/page.tsx`, `setup-2fa/page.tsx`, `verify-2fa/page.tsx`
- `app/(app)/layout.tsx`, `dashboard/page.tsx`, `settings/page.tsx`
- `components/theme-provider.tsx` — light/dark toggle, localStorage
- `docs/` folder for project documentation
