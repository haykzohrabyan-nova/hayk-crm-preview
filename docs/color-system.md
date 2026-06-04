# BazaarPrinting CRM — Color System

How colors are defined, switched between light and dark mode, and applied in the UI.

**Source of truth:** `app/globals.css`  
**Theme toggle:** `components/layout/theme-provider.tsx`  
**Cursor rule (for contributors):** `.cursor/rules/color-tokens.mdc`

---

## 1. Design approach

The app uses a **token-based** color system:

1. Every brand and semantic color is a **CSS custom property** (`--color-*`).
2. **Light** values live on `:root`; **dark** values override them under `.dark`.
3. Components reference tokens (`var(--color-accent)`), not raw hex — so one file change rethemes the whole app.
4. **Tailwind v4** maps shadcn primitives (`bg-primary`, `text-muted-foreground`, etc.) to the same tokens via `@theme inline` in `globals.css`.

**Themes:**

| Mode | Brand feel | Accent |
|------|------------|--------|
| Light | Navy & gold | Gold `#E8C97A` on navy sidebar `#1B2B4B` |
| Dark | Charcoal & orange | Orange `#F97316` on zinc surfaces |

---

## 2. Where colors are defined

### `app/globals.css` — all `--color-*` tokens

```css
:root {
  --color-bg: #ffffff;
  --color-accent: #E8C97A;
  /* … */
}

.dark {
  --color-bg: #18181B;
  --color-accent: #F97316;
  /* … */
}
```

To change the palette globally, edit hex values in **both** `:root` and `.dark` blocks.

### Tailwind / shadcn bridge (`@theme inline`)

The same file maps Bazaar tokens to Tailwind theme keys used by shadcn components:

| Tailwind token | Maps to |
|----------------|---------|
| `background` | `--color-bg` |
| `foreground` | `--color-text-primary` |
| `card` | `--color-surface` |
| `primary` | `--color-accent` |
| `primary-foreground` | `--color-btn-primary-text` |
| `muted` | `--color-row-alt` |
| `muted-foreground` | `--color-text-muted` |
| `destructive` | `--color-danger` |
| `border` / `input` | `--color-border` |
| `ring` | `--color-accent` |
| `sidebar` | `--color-topbar` |

Example: `<Button variant="default">` uses `bg-primary` → accent background.

### Base document styles

`body` sets default background and text from tokens. `border-color` on `*` inherits `--color-border`. Skeleton shimmer (`.skeleton`) uses `--color-border` and `--color-row-alt`.

---

## 3. Light / dark mode switching

### How it works

1. `ThemeProvider` wraps the app in `app/layout.tsx`.
2. User choice is stored in **`localStorage`** key `bazaar-theme`: `"light"` | `"dark"` | `"system"`.
3. On change, the provider toggles class **`dark`** on `<html>` (`document.documentElement`).
4. CSS variables under `.dark { … }` replace the `:root` values automatically.

```tsx
// components/layout/theme-provider.tsx
const isDark = theme === "dark" || (theme === "system" && prefersDark);
root.classList.toggle("dark", isDark);
```

### Tailwind dark variant

`globals.css` registers:

```css
@custom-variant dark (&:is(.dark *));
```

So `dark:bg-muted` applies when an ancestor has `.dark` (typically `<html class="dark">`).

### Sidebar toggle

The sidebar theme control calls `useTheme().setTheme(...)` — same storage and class toggle.

### `color-scheme`

`:root` and `.dark` set `color-scheme: light` / `dark` so native controls (scrollbars, form controls) match the theme. `<select>` elements also get explicit token backgrounds in `globals.css`.

---

## 4. Token reference

### Core UI

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `--color-bg` | `#FFFFFF` | `#18181B` | Page background |
| `--color-surface` | `#FAFAFA` | `#27272A` | Cards, modals, inputs |
| `--color-topbar` | `#32373F` | `#32373F` | Sidebar background |
| `--color-border` | `#E5E7EB` | `#3F3F46` | Borders, dividers |
| `--color-text-primary` | `#000000` | `#F4F4F5` | Body text |
| `--color-text-muted` | `#000000` | `#71717A` | Labels, placeholders |
| `--color-text-inverse` | `#FFFFFF` | `#FFFFFF` | Text on dark/colored buttons |

### Accent & buttons

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `--color-accent` | `#E8C97A` | `#F97316` | Brand accent, focus rings, top loader |
| `--color-accent-dark` | `#C9A84C` | `#FB923C` | Accent hover |
| `--color-btn-primary-bg` | `#E8C97A` | `#F97316` | Primary CTA background |
| `--color-btn-primary-text` | `#1B2B4B` | `#FFFFFF` | Primary CTA text |
| `--color-btn-verify-bg` | `#000000` | `#F97316` | Verify / secondary action buttons |
| `--color-btn-verify-text` | `#FFFFFF` | `#FFFFFF` | Verify button text |

### Tables & badges

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `--color-badge-bg` | `#EAF0FB` | `#2D1F0E` | Tab count badges, chips |
| `--color-badge-text` | `#1B2B4B` | `#FB923C` | Badge text |
| `--color-row-alt` | `#F8F7F4` | `#27272A` | Zebra table rows |
| `--color-row-hover` | `#EAF0FB` | `#27272A` | Row hover |

### Tabs

| Token | Light | Dark |
|-------|-------|------|
| `--color-tab-active` | `#000000` | `#F97316` |
| `--color-tab-underline` | `#E8C97A` | `#F97316` |
| `--color-tab-inactive` | `#888888` | `#71717A` |

### Semantic sets

Each semantic color has **bg**, **text**, **border**, and sometimes **text-deep** variants:

| Family | Tokens | Use |
|--------|--------|-----|
| Danger | `--color-danger`, `--color-danger-bg`, `--color-danger-border`, `--color-danger-text-deep` | Errors, reject, destructive actions |
| Success | `--color-success`, `--color-success-bg`, `--color-success-border` | Positive states, validated, won |
| Warning | `--color-warning`, `--color-warning-bg`, `--color-warning-border`, `--color-warning-text-deep` | Hold, amber alerts |
| Info | `--color-info-bg`, `--color-info-text`, `--color-info-border`, `--color-info-text-deep` | Banners, quoted, known customer |
| Neutral | `--color-neutral-bg`, `--color-neutral-text`, `--color-neutral-border` | Pending, not defined |

Dark mode uses some **rgba** borders on danger (e.g. `rgba(239,68,68,0.30)`) — still only defined in `globals.css`, not in components.

---

## 5. How components use colors

### Preferred: inline `style` with CSS variables

Most CRM screens use explicit tokens (works in light and dark without per-class duplication):

```tsx
<div
  className="rounded-xl border p-4"
  style={{
    background: "var(--color-surface)",
    borderColor: "var(--color-border)",
    color: "var(--color-text-primary)",
  }}
/>
```

### shadcn / Tailwind classes

Primitives in `components/ui/` often use theme keys:

```tsx
<Button variant="default" />  {/* bg-primary, text-primary-foreground */}
<Button variant="destructive" />  {/* uses --color-danger */}
```

### Reusable pills (semantic mapping)

| Component | File | Behavior |
|-----------|------|----------|
| `StatusPill` | `components/ui/status-pill.tsx` | Maps each lead/sales status → semantic token triple (bg/text/border) |
| `UrgencyPill` | `components/ui/urgency-pill.tsx` | High → danger, Medium → warning, Low → success, else neutral |

Change status colors by editing token values in `globals.css`, or adjust the mapping in those two files.

### Sidebar (special case)

Sidebar nav uses `--color-topbar` (`#32373F`), `--color-sidebar-nav` (`#FFFFFF`) for inactive links, `--color-accent` for active background, and `--color-btn-primary-text` for active label. Utility row uses `--color-sidebar-nav-muted`.

### Page chrome

- **NextTopLoader** (`app/layout.tsx`): `color="var(--color-accent)"`
- **Tables:** sticky headers, zebra rows via `--color-row-alt` / `--color-row-hover`
- **Mobile cards:** `--color-surface` + `--color-border` (see `mobile-list-card.tsx`)

---

## 6. Rules for developers

### Do

- Use `var(--color-*)` for any new UI color.
- Add **new** tokens to **both** `:root` and `.dark` in `globals.css` before using them.
- Use `StatusPill` / `UrgencyPill` for status and urgency — don’t invent one-off reds/greens.
- Use semantic tokens for banners: `var(--color-warning-bg)` + `var(--color-warning)` etc.

### Don’t

- Hardcode hex in `components/**/*.tsx` (enforced by project rules).
- Rely on light-only Tailwind colors like `bg-red-100` for product UI.
- Forget dark mode when adding a token — always pair light/dark definitions.

### Focus rings (forms)

Shared pattern uses accent (light gold glow); see `.cursor/rules/form-inputs.mdc`:

```tsx
onFocus={(e) => {
  e.currentTarget.style.borderColor = "var(--color-accent)";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232,201,122,0.18)";
}}
```

Error borders: `var(--color-danger)`.

---

## 7. Exceptions (fixed / external colors)

These paths **do not** follow the live theme toggle today:

| Area | Why | Location |
|------|-----|----------|
| Public quote HTML | Customer-facing document styled as fixed light “invoice” | `components/public/public-quote-document.tsx` (constants `NAVY`, `MUTED`, etc.) |
| PDF output | Print/email PDF uses its own palette for consistency | `lib/pdf/invoice-pdf.tsx` |
| Email HTML templates | Inline styles for email clients | `lib/integrations/*-template.ts` |

Staff app pages respect light/dark; public quote view and PDFs are intentionally **light-branded** regardless of staff theme.

---

## 8. How to retheme the app

1. Open `app/globals.css`.
2. Update hex (or rgba) in `:root` for light theme.
3. Mirror changes in `.dark` for dark theme.
4. Reload — no `tailwind.config.ts` (Tailwind v4 reads `@theme inline` from the same file).
5. Spot-check: sidebar, primary buttons, tables, `StatusPill`, danger banners, public quote (separate file if needed).

Optional: adjust shadcn bridge in `@theme inline` only if you need different mappings (e.g. `primary` should not equal accent).

---

## 9. Quick lookup

```
app/globals.css          ← define all --color-* tokens + @theme inline
app/layout.tsx           ← ThemeProvider + top loader accent
components/layout/theme-provider.tsx
components/layout/sidebar.tsx
components/ui/status-pill.tsx
components/ui/urgency-pill.tsx
components/ui/button.tsx ← Tailwind primary/destructive
.cursor/rules/color-tokens.mdc
docs/color-system.md     ← this document
```

For UI layout and typography (not color tokens), see `.cursor/rules/ui-design-system.mdc` and `docs/TECHNICAL_REFERENCE.md` §24.

### Owner color picker (shareable HTML)

**[`docs/owner-color-picker.html`](./owner-color-picker.html)** — standalone page for the business owner to try presets, adjust light/dark brand colors, preview a mock CRM UI, and **Copy my choices** to email back to the developer. Open in any browser (double-click the file or attach to email).
