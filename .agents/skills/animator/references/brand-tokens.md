# TTML Brand Reference

Complete design system extracted from the live Talk to My Lawyer codebase.

## Table of Contents
- [Color System](#color-system)
- [Typography](#typography)
- [Border Radius](#border-radius)
- [Shadows & Elevation](#shadows--elevation)
- [Spacing Rhythm](#spacing-rhythm)
- [Logo Assets](#logo-assets)

---

## Color System

All values use OKLCH. Source: `client/src/index.css`

### Light Theme (`:root`)

| Token | Value | Usage |
|---|---|---|
| `--primary` | `oklch(0.45 0.18 260)` | Navy blue — primary actions, links, CTA |
| `--primary-foreground` | `oklch(0.98 0 0)` | White text on primary |
| `--background` | `oklch(0.985 0.002 260)` | Page background — near-white with blue tint |
| `--foreground` | `oklch(0.18 0.02 260)` | Body text — very dark navy |
| `--card` | `oklch(1 0 0)` | Pure white card surfaces |
| `--card-foreground` | `oklch(0.18 0.02 260)` | Card text |
| `--popover` | `oklch(1 0 0)` | Popover/dropdown surface |
| `--popover-foreground` | `oklch(0.18 0.02 260)` | Popover text |
| `--secondary` | `oklch(0.96 0.008 260)` | Subtle blue-tinted gray |
| `--secondary-foreground` | `oklch(0.35 0.04 260)` | Dark blue-gray text |
| `--muted` | `oklch(0.955 0.008 260)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.50 0.02 260)` | De-emphasized text |
| `--accent` | `oklch(0.94 0.02 260)` | Accent backgrounds |
| `--accent-foreground` | `oklch(0.18 0.02 260)` | Accent text |
| `--destructive` | `oklch(0.55 0.22 25)` | Error/danger red |
| `--destructive-foreground` | `oklch(0.98 0 0)` | White on destructive |
| `--border` | `oklch(0.91 0.008 260)` | Subtle blue-tinted border |
| `--input` | `oklch(0.91 0.008 260)` | Input borders |
| `--ring` | `oklch(0.45 0.18 260)` | Focus ring — matches primary |

#### Chart Colors (Light)
| Token | Value |
|---|---|
| `--chart-1` | `oklch(0.55 0.20 260)` |
| `--chart-2` | `oklch(0.60 0.16 200)` |
| `--chart-3` | `oklch(0.50 0.14 150)` |
| `--chart-4` | `oklch(0.65 0.18 280)` |
| `--chart-5` | `oklch(0.55 0.12 320)` |

#### Sidebar Colors (Light)
| Token | Value | Usage |
|---|---|---|
| `--sidebar` | `oklch(0.17 0.04 260)` | Very dark navy background |
| `--sidebar-foreground` | `oklch(0.92 0.01 260)` | Light text |
| `--sidebar-primary` | `oklch(0.60 0.20 260)` | Brighter blue for active items |
| `--sidebar-primary-foreground` | `oklch(0.98 0 0)` | White |
| `--sidebar-accent` | `oklch(0.24 0.04 260)` | Hover/active background |
| `--sidebar-accent-foreground` | `oklch(0.92 0.01 260)` | Light text |
| `--sidebar-border` | `oklch(0.28 0.04 260)` | Dark separator |
| `--sidebar-ring` | `oklch(0.60 0.20 260)` | Focus ring |

### Dark Theme (`.dark`)

| Token | Value | Notes |
|---|---|---|
| `--primary` | `oklch(0.60 0.20 260)` | Brighter blue for dark mode |
| `--primary-foreground` | `oklch(0.98 0 0)` | White |
| `--background` | `oklch(0.13 0.02 260)` | Very dark navy |
| `--foreground` | `oklch(0.92 0.01 260)` | Light text |
| `--card` | `oklch(0.17 0.025 260)` | Slightly lighter than bg |
| `--card-foreground` | `oklch(0.92 0.01 260)` | Light text |
| `--popover` | `oklch(0.17 0.025 260)` | Same as card |
| `--popover-foreground` | `oklch(0.92 0.01 260)` | Light text |
| `--secondary` | `oklch(0.22 0.03 260)` | Elevated surface |
| `--secondary-foreground` | `oklch(0.80 0.01 260)` | Slightly muted text |
| `--muted` | `oklch(0.22 0.03 260)` | Same as secondary |
| `--muted-foreground` | `oklch(0.65 0.015 260)` | De-emphasized |
| `--accent` | `oklch(0.22 0.03 260)` | Accent surface |
| `--accent-foreground` | `oklch(0.92 0.01 260)` | Light text |
| `--destructive` | `oklch(0.60 0.22 25)` | Brighter red |
| `--destructive-foreground` | `oklch(0.98 0 0)` | White |
| `--border` | `oklch(0.28 0.03 260)` | Subtle dark border |
| `--input` | `oklch(0.28 0.03 260)` | Input borders |
| `--ring` | `oklch(0.60 0.20 260)` | Focus ring |

#### Sidebar Colors (Dark)
| Token | Value |
|---|---|
| `--sidebar` | `oklch(0.13 0.02 260)` |
| `--sidebar-foreground` | `oklch(0.92 0.01 260)` |
| `--sidebar-accent` | `oklch(0.22 0.03 260)` |
| `--sidebar-accent-foreground` | `oklch(0.92 0.01 260)` |
| `--sidebar-border` | `oklch(0.28 0.03 260)` |
| `--sidebar-ring` | `oklch(0.60 0.20 260)` |

#### Chart Colors (Dark)
| Token | Value |
|---|---|
| `--chart-1` | `oklch(0.60 0.20 260)` |
| `--chart-2` | `oklch(0.65 0.16 200)` |
| `--chart-3` | `oklch(0.55 0.14 150)` |
| `--chart-4` | `oklch(0.70 0.18 280)` |
| `--chart-5` | `oklch(0.60 0.12 320)` |

### Hardcoded Brand Blues (used in components)

These hex values appear in `HowItWorks.tsx`, `FirstVisitPopup.tsx`, and `Home.tsx`:

| Hex | Tailwind Class | Usage |
|---|---|---|
| `#3b82f6` | `blue-500` | Connector gradients, orbit strokes |
| `#2563eb` | `blue-600` | Active borders, primary actions, CTA backgrounds |
| `#1d4ed8` | `blue-700` | Gradient endpoints |
| `#1e40af` | `blue-800` | Step badges |
| `#e2e8f0` | `slate-200` | Inactive borders, tracks |
| `#cbd5e1` | `slate-300` | Inactive dots |
| `#f8fafc` | `slate-50` | Inactive dot fills |
| `#64748b` | `slate-500` | Inactive step badges |

### Gradient Patterns

| Context | Gradient |
|---|---|
| Connector fill | `linear-gradient(90deg, #3b82f6 0%, #2563eb 60%, #1d4ed8 100%)` |
| Popup header | `bg-gradient-to-br from-indigo-600 via-blue-700 to-violet-800` |
| Popup CTA | `bg-gradient-to-r from-indigo-600 to-blue-600` |
| Auth page bg | `bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50` |
| Dashboard banner | `bg-gradient-to-r from-indigo-600 to-blue-600` |

---

## Typography

| Property | Value | Source |
|---|---|---|
| Font family | `"Inter", ui-sans-serif, system-ui, sans-serif` | `--font-sans` in `@theme` |
| Body rendering | `antialiased` | `@layer base` |
| Heading weights | `700` (h1), `600` (h2, h3) | `.prose` styles |
| Body line-height | `1.75` | `.prose` |
| Max prose width | `65ch` | `.prose` |

### Type Scale (from components)

| Element | Size | Weight | Tracking |
|---|---|---|---|
| Hero headline | `text-3xl sm:text-4xl md:text-5xl` | `font-bold` | `tracking-tight` |
| Section headline | `text-2xl sm:text-3xl md:text-4xl` | `font-bold` | — |
| Section eyebrow | `text-sm` | `font-semibold` | `tracking-widest uppercase` |
| Card title | `text-lg` | `font-bold` | — |
| Body text | `text-[15px]` | normal | — |
| Nav items | `text-[13px]` | `font-semibold` | `tracking-wide uppercase` |
| Small labels | `text-xs` | `font-semibold` | — |

---

## Border Radius

| Token | Value |
|---|---|
| `--radius` | `0.625rem` (10px) |
| `--radius-sm` | `calc(var(--radius) - 4px)` → 6px |
| `--radius-md` | `calc(var(--radius) - 2px)` → 8px |
| `--radius-lg` | `var(--radius)` → 10px |
| `--radius-xl` | `calc(var(--radius) + 4px)` → 14px |

Common usage patterns:
- Cards: `rounded-xl` (12px) or `rounded-3xl` (24px for popup)
- Buttons: `rounded-full` (pill) or `rounded-lg` (10px)
- Badges/chips: `rounded-full`
- Input fields: `rounded-md` (6px)
- Step circles: `rounded-full`

---

## Shadows & Elevation

| Context | Shadow Value |
|---|---|
| Navbar | `shadow-sm` |
| Popup card | `shadow-[0_25px_60px_-12px_rgba(0,0,0,0.35)]` |
| CTA hover | `shadow-[0_4px_20px_rgba(79,70,229,0.4)]` |
| Nav CTA | `shadow-md shadow-blue-600/20` |
| Active step circle | `0 8px 32px rgba(37,99,235,0.18), 0 0 0 6px rgba(37,99,235,0.06)` |
| Inactive step circle | `0 4px 16px rgba(0,0,0,0.06)` |
| Icon glow (popup) | `0 0 15px rgba(255,255,255,0.15), 0 0 30px rgba(99,102,241,0.1)` |
| Connector glow | `0 0 16px rgba(37,99,235,0.35), 0 0 4px rgba(37,99,235,0.5)` |
| Burst label | `shadow-lg shadow-blue-500/25` |

---

## Spacing Rhythm

| Pattern | Values |
|---|---|
| Section padding (vertical) | `py-16 sm:py-20 md:py-28` |
| Section padding (horizontal) | `px-4 sm:px-6 lg:px-12` |
| Max content width | `max-w-7xl` (navbar), `max-w-6xl` (sections), `max-w-3xl` (headings) |
| Container padding | `1rem` → `1.5rem` (640px) → `2rem` (1024px), max `1280px` |
| Card grid gap | `gap-8 md:gap-6 lg:gap-10` |
| Section heading margin | `mb-16 md:mb-24` |

---

## Logo Assets

| Asset | Path | Dimensions |
|---|---|---|
| Full logo (icon + wordmark) | `/logo-full.png` | Badge icon with "Talk-To-My Lawyer" text |
| Icon only (badge) | `/logo-icon-badge.png` | Square badge with scales of justice |

### BrandLogo Component

**File:** `client/src/components/shared/BrandLogo.tsx`

```tsx
<BrandLogo
  href="/"           // optional — wraps in Link
  size="sm|md|lg|xl" // height: 36/44/52/60 desktop, 28/32/36/40 mobile
  iconOnly           // shows badge only
  hideWordmarkOnMobile // full on desktop, full (smaller) on mobile
  variant="light|dark|sidebar" // dark inverts with brightness-0
  className=""
/>
```

Size config:
| Size | Desktop height | Mobile height |
|---|---|---|
| sm | 36px | 28px |
| md | 44px | 32px |
| lg | 52px | 36px |
| xl | 60px | 40px |
