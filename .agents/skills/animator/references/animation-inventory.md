# TTML Animation Inventory

Every existing keyframe, animation utility class, and animated component in the codebase. Reuse these before creating new ones.

## Table of Contents
- [Global Keyframes (index.css)](#global-keyframes-indexcss)
- [Global Utility Classes (index.css)](#global-utility-classes-indexcss)
- [HowItWorks Inline Keyframes](#howitworks-inline-keyframes)
- [Component-Level Animations](#component-level-animations)
- [Tailwind / tw-animate-css](#tailwind--tw-animate-css)
- [Transition Patterns in Components](#transition-patterns-in-components)

---

## Global Keyframes (index.css)

**File:** `client/src/index.css`

### `bounce-in` (line 223)
```css
@keyframes bounce-in {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.3); }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); opacity: 1; }
}
```
Duration: `0.5s ease-out forwards`
Usage: `.animate-bounce-in` — success checkmarks, completion indicators

### `scale-in` (line 233)
```css
@keyframes scale-in {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
```
Usage: Programmatic — applied via inline styles

### `gentle-float` (line 239)
```css
@keyframes gentle-float {
  0% { transform: rotate(2deg) translateY(0); }
  25% { transform: rotate(0.5deg) translateY(-6px); }
  50% { transform: rotate(-1deg) translateY(-10px); }
  75% { transform: rotate(0.5deg) translateY(-4px); }
  100% { transform: rotate(2deg) translateY(0); }
}
```
Duration: `6s cubic-bezier(0.45, 0, 0.2, 1) infinite`
Usage: `.hero-card-float` — floating card in hero section
Reduced motion: `animation: none; transform: rotate(1.5deg);`

### `popup-overlay-in` (line 263)
```css
@keyframes popup-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```
Duration: `0.3s ease-out forwards`
Usage: `.animate-popup-overlay` — modal backdrop fade

### `popup-card-in` (line 267)
```css
@keyframes popup-card-in {
  0% { opacity: 0; transform: scale(0.9) translateY(20px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
```
Duration: `0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards`
Usage: `.animate-popup-card` — popup card entrance (starts with opacity: 0)

### `popup-shimmer` (line 271)
```css
@keyframes popup-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
```
Duration: `3s ease-in-out infinite`
Usage: `.animate-popup-shimmer` — shimmer highlight sweep on popup header
Background: `linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.15) 55%, transparent 70%); background-size: 200% 100%;`

### `popup-icon-glow` (line 275)
```css
@keyframes popup-icon-glow {
  0%, 100% { box-shadow: 0 0 15px rgba(255,255,255,0.15), 0 0 30px rgba(99,102,241,0.1); }
  50% { box-shadow: 0 0 25px rgba(255,255,255,0.3), 0 0 50px rgba(99,102,241,0.2); }
}
```
Duration: `2.5s ease-in-out infinite`
Usage: `.animate-popup-icon-glow` — pulsing glow on popup icon container

### `popup-pulse-soft` (line 279)
```css
@keyframes popup-pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```
Duration: `2s ease-in-out infinite`
Usage: `.animate-popup-pulse` — gentle opacity pulse (timer icon)

---

## Global Utility Classes (index.css)

| Class | Keyframe | Duration/Timing | Notes |
|---|---|---|---|
| `.animate-bounce-in` | `bounce-in` | `0.5s ease-out forwards` | One-shot entrance |
| `.hero-card-float` | `gentle-float` | `6s cubic-bezier(0.45, 0, 0.2, 1) infinite` | Pauses on hover, has `will-change: transform` |
| `.animate-popup-overlay` | `popup-overlay-in` | `0.3s ease-out forwards` | Backdrop |
| `.animate-popup-card` | `popup-card-in` | `0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards` | Starts opacity:0 |
| `.animate-popup-shimmer` | `popup-shimmer` | `3s ease-in-out infinite` | Needs specific gradient bg |
| `.animate-popup-icon-glow` | `popup-icon-glow` | `2.5s ease-in-out infinite` | Box-shadow pulse |
| `.animate-popup-pulse` | `popup-pulse-soft` | `2s ease-in-out infinite` | Opacity pulse |

---

## HowItWorks Inline Keyframes

**File:** `client/src/components/HowItWorks.tsx` (inline `<style>` block, line 200)

These are defined inside the component via a `<style>` tag:

### `burst-pop-fade`
```css
0% { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.7); }
20% { opacity: 1; transform: translateX(-50%) translateY(-6px) scale(1.05); }
35% { transform: translateX(-50%) translateY(-10px) scale(1); }
100% { opacity: 0; transform: translateX(-50%) translateY(-28px) scale(0.95); }
```
Duration: `1400ms cubic-bezier(0.16, 1, 0.3, 1) forwards`
Usage: Burst label ("Form submitted!", "Drafted!", "Approved!") — pops up and fades out

### `tick-entrance`
```css
0% { transform: scale(0) rotate(-45deg); }
50% { transform: scale(1.2) rotate(5deg); }
70% { transform: scale(0.9) rotate(-2deg); }
100% { transform: scale(1) rotate(0deg); }
```
Duration: `600ms cubic-bezier(0.16, 1, 0.3, 1) forwards`
Usage: Completion checkmark on final step

### `tick-glow-ring`
```css
0% { transform: scale(0.5); opacity: 0.6; }
100% { transform: scale(2.8); opacity: 0; }
```
Duration: `800ms cubic-bezier(0, 0, 0.2, 1) forwards`
Usage: Expanding glow ring behind completion tick

### `dot-ping`
```css
0% { transform: scale(1); opacity: 0.6; }
100% { transform: scale(3.5); opacity: 0; }
```
Duration: `600ms cubic-bezier(0, 0, 0.2, 1) forwards`
Usage: Ping effect on connector dots when step activates

### `icon-settle`
```css
0% { transform: scale(0.6) rotate(-8deg); opacity: 0; }
60% { transform: scale(1.08) rotate(2deg); opacity: 1; }
100% { transform: scale(1) rotate(0deg); opacity: 1; }
```
Duration: `500ms cubic-bezier(0.16, 1, 0.3, 1) forwards`
Usage: Step icon entrance when step activates

### `card-lift`
```css
0% { transform: translateY(40px) scale(0.97); opacity: 0; }
60% { transform: translateY(-4px) scale(1.01); opacity: 1; }
100% { transform: translateY(0) scale(1); opacity: 1; }
```
Duration: `700ms cubic-bezier(0.16, 1, 0.3, 1)` with stagger `100 + i * 140ms`
Usage: Step card entrance on scroll

### `shimmer-line`
```css
0% { background-position: -200% 0; }
100% { background-position: 200% 0; }
```
Usage: Background shimmer effect (similar to popup-shimmer)

### `badge-pop`
```css
0% { transform: scale(0) rotate(-20deg); }
60% { transform: scale(1.15) rotate(5deg); }
100% { transform: scale(1) rotate(0deg); }
```
Duration: `400ms cubic-bezier(0.16, 1, 0.3, 1) forwards`
Usage: Step number badge entrance

### `subtle-float`
```css
0%, 100% { transform: translateY(0); }
50% { transform: translateY(-6px); }
```
Duration: `4s ease-in-out infinite` with stagger `i * 200ms`
Usage: Active step icon gentle bobbing

---

## Component-Level Animations

### HowItWorks Scroll System (`HowItWorks.tsx`)
- **Scroll-linked progress**: `IntersectionObserver` + `scroll` event calculates 0→1 progress
- **Step thresholds**: `[0.15, 0.45, 0.72]` — each step activates at its threshold
- **Orbit SVG circles**: `strokeDasharray`/`strokeDashoffset` animated by scroll progress
- **Connector bar**: Width fills based on progress with glow shadow
- **Burst labels**: Appear on step activation, auto-dismiss after 1400ms
- **Completion tick**: Appears when progress ≥ 0.92
- **Mobile progress dots**: Width expands from 12px to 32px when active
- **Reduced motion**: Sets progress to 1 immediately, skips all transforms

### FirstVisitPopup (`FirstVisitPopup.tsx`)
- Uses global CSS classes: `.animate-popup-overlay`, `.animate-popup-card`, `.animate-popup-shimmer`, `.animate-popup-icon-glow`, `.animate-popup-pulse`
- CTA button: `active:scale-[0.98]` press feedback
- Close button: `transition-all duration-200` hover

### PipelineProgressModal (`PipelineProgressModal.tsx`)
- Spinner: `animate-spin` on `Loader2` icon for active stage
- Stage transitions: Color changes via className (no explicit animation)
- Polling: `refetchInterval: 3000` for live status updates

### StatusTimeline (`shared/StatusTimeline.tsx`)
- Spinner: `animate-spin` on `Loader2` for in-progress stages
- No entrance animations — relies on color state changes

### StatusBadge (`shared/StatusBadge.tsx`)
- No animations — static colored badges

### LetterProgressBar (`shared/LetterProgressBar.tsx`)
- `transition-colors` on step circles
- No entrance animations

### Home Page (`pages/Home.tsx`)
- Loading spinner: `animate-spin` on border circle
- Mobile menu: No animation (instant show/hide)
- Scroll-to: `behavior: "smooth"` for nav anchor clicks

### Skeletons (`components/skeletons.tsx`)
- Uses `<Skeleton>` from shadcn — built-in pulse animation
- Comprehensive skeleton set for every page type

---

## Tailwind / tw-animate-css

**Import:** `@import "tw-animate-css";` in `index.css`

The `tw-animate-css` package provides Tailwind-compatible animation utility classes. Commonly used:
- `animate-spin` — continuous rotation (loading spinners)
- `animate-pulse` — opacity pulse (skeleton loading)

The project also uses `@custom-variant dark (&:is(.dark *));` for dark mode.

---

## Transition Patterns in Components

### Common Easing Curves Used

| Curve | CSS Value | Where Used |
|---|---|---|
| smooth-out | `cubic-bezier(0.16, 1, 0.3, 1)` | HowItWorks cards/labels, popup-card, hero-card hover, section reveals |
| gentle-in-out | `cubic-bezier(0.45, 0, 0.2, 1)` | hero-card-float, Material-style easing |
| decelerate | `cubic-bezier(0, 0, 0.2, 1)` | dot-ping, tick-glow-ring |
| ease-out | `ease-out` | bounce-in, popup-overlay |
| ease | `ease` | Color/opacity transitions in steps |

### Common Transition Durations

| Duration | Where Used |
|---|---|
| 200ms | Button hovers, close button transitions |
| 300ms | Overlay entrance, opacity transitions |
| 400ms | Border-color changes, badge-pop, icon color |
| 500ms | Scale transforms, step text reveals, mobile dots |
| 600ms | Section heading reveals, box-shadow transitions |
| 700ms | Card-lift entrance |
| 800ms | Glow ring, radial gradient scale |

### Inline Transition Patterns

HowItWorks uses inline styles with conditional transitions:
```tsx
style={{
  opacity: isActive ? 1 : 0.5,
  transform: isActive ? "translateY(0)" : "translateY(8px)",
  transition: "opacity 500ms ease 100ms, transform 500ms cubic-bezier(0.16, 1, 0.3, 1) 100ms",
}}
```

Section heading pattern:
```tsx
style={{
  opacity: inView ? 1 : 0,
  transform: inView ? "translateY(0)" : "translateY(24px)",
  transition: "opacity 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
}}
```

### Reduced Motion Support

**HowItWorks** has full support via `useReducedMotion()` hook:
- Custom hook listens to `(prefers-reduced-motion: reduce)` media query
- When enabled: sets progress to 1 immediately, skips all transform/keyframe animations
- All animation-bearing elements check a `skip` boolean

**index.css** has a reduced motion rule for `.hero-card-float`:
```css
@media (prefers-reduced-motion: reduce) {
  .hero-card-float { animation: none; transform: rotate(1.5deg); }
}
```

Other components do not yet have explicit reduced-motion handling.

---

## Additional Component Transitions

### OnboardingModal (`components/OnboardingModal.tsx`)
- Progress bar: `transition-all duration-500` on width fill (line ~107)
- Step dots: width transition via `transition-all` (active dot widens)
- Close button: `transition-colors` on hover (line ~121)

### ReviewModal (`components/shared/ReviewModal.tsx`)
- Loading spinners: `animate-spin` on `Loader2` (lines ~286, ~420, ~821)
- Skeleton loading: `animate-pulse` on placeholder elements (lines ~234–235)
- Close/action buttons: `transition-colors` on hover (line ~268)
- Uses shadcn Dialog (inherits Radix dialog animations)

### LetterPaywall (`components/LetterPaywall.tsx`)
- Loading spinners: `animate-spin` on `Loader2` (lines ~146, ~252, ~327)
- Preview blur: `transition: "filter 0.3s ease"` inline style (line ~166) — blurs/unblurs content
- Uses shadcn Dialog animations

### UpgradeBanner (`components/UpgradeBanner.tsx`)
- Close button: `transition-colors` on hover (line ~55)
- No entrance/exit animation

### DiscountCodeInput (`components/DiscountCodeInput.tsx`)
- Input border: `transition-colors` on validation state change (line ~144)
- Loading spinner: `animate-spin` on `Loader2` (line ~183)

### Home Page (`pages/Home.tsx`)
- Loading state: `animate-spin` on border circle spinner (line ~107)
- Smooth scroll: `behavior: "smooth"` for anchor navigation
- Nav items: `transition-colors` on hover
- CTA button: `transition-all`, `shadow-md shadow-blue-600/20`
- Letter type tags: `transition-colors` on hover
- Mobile menu: instant show/hide (no animation)

### DocumentAnalyzer (`pages/DocumentAnalyzer.tsx`)
- Upload zone: `transition-all` on drag state change (line ~441)
- Emotion bars: `transition-all duration-700 ease-out` on gradient width (line ~855)
- Loading spinners: `animate-spin` on `Loader2` (lines ~513, ~538)
- Cards/items: `transition-colors` on hover throughout
- Nav: matches Home page nav transition pattern

### Auth Pages (Login, Signup, ForgotPassword, VerifyEmail, ResetPassword)
- Submit buttons: `animate-spin` on `Loader2` during loading
- No entrance animations
- Link hovers: `transition-colors`

### Pricing Page (`pages/Pricing.tsx`)
- Loading state: `animate-spin` on checkout buttons (line ~213)
- No card entrance animations

### FAQ Page (`pages/FAQ.tsx`)
- Accordion items: `transition-colors` on open/close (line ~191) via Radix
- Footer links: `transition-colors` on hover

### SubmitLetter (`pages/subscriber/SubmitLetter.tsx`)
- Step indicator tabs: `transition-colors` on active state (line ~582)
- Letter type cards: `transition-all` on selection (line ~622)
- Delete buttons: `transition-colors` on hover (line ~1112)

### Onboarding (`pages/Onboarding.tsx`)
- Role cards: `transition-all hover:shadow-md hover:border-indigo-300` (line ~180)
- Submit button: `animate-spin` on `Loader2` (line ~277)

---

## Shadcn/Radix Animation Classes

Used across UI primitives in `components/ui/`:

| Pattern | Components | Description |
|---|---|---|
| `animate-in` / `animate-out` | Dialog, Sheet, DropdownMenu, Tooltip | Radix state-driven enter/exit |
| `fade-in-0` / `fade-out-0` | Dialog, Sheet, DropdownMenu, Tooltip | Opacity transitions |
| `zoom-in-95` / `zoom-out-95` | DropdownMenu, Tooltip | Scale from 95% |
| `slide-in-from-*` | DropdownMenu, Tooltip, Sheet | Directional slide |
| `animate-pulse` | Skeleton (`components/ui/skeleton.tsx`) | Continuous opacity pulse |
| `transition-[color,box-shadow]` | Badge, Input | Property-specific transitions |
| `transition-[width,height,padding]` | Sidebar menu button | Layout transitions |
| `transition-[left,right,width]` | Sidebar container | Collapse/expand |
| `duration-200` | Sidebar transitions | Sidebar open/close speed |
| `ease-linear` | Sidebar transitions | Linear easing for sidebar |
| `data-[state=closed]:duration-300` | Sheet | Exit duration |
| `data-[state=open]:duration-500` | Sheet | Entry duration |
