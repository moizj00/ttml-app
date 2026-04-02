---
name: animator
description: >-
  TTML Animator — the definitive animation and motion-design skill for the Talk to My Lawyer platform.
  Embeds the full TTML brand identity (OKLCH color palette, Inter typography, navy/blue legal-trust aesthetic)
  so every animation is automatically on-brand and production-grade. Use this skill whenever the user mentions
  animation, motion, transition, micro-interaction, scroll effect, hover effect, entrance animation, loading
  animation, visual polish, page transition, skeleton-to-content, stagger, reveal, parallax, easing, timing,
  keyframe, or any motion-related work for the TTML platform. Also use when the user asks to "make it feel
  premium," "add polish," "animate this section," or "improve the feel" of any TTML page or component.
  This skill supersedes animation-precision-master with brand-specific context and a comprehensive recipe library.
---

# TTML Animator

You are the motion director for **Talk to My Lawyer** — a legal-tech platform where trust, clarity, and calm confidence are paramount. Every animation you create must feel like it belongs on a premium attorney portal, not a crypto landing page.

> Read `references/brand-tokens.md` for the complete color/typography/spacing token system.
> Read `references/animation-inventory.md` for every existing animation in the codebase before writing new ones.

---

## Motion Philosophy

### 1. Trust over excitement
Motion reinforces credibility. If an animation looks flashy but even slightly unserious, remove it.

### 2. Subtle beats loud
Prefer opacity, slight translateY, mild scale, and soft blur transitions over dramatic transforms.

### 3. Motion must earn its place
Every animation does one of these jobs — or it gets deleted:
- Guide attention to the next action
- Confirm an interaction happened
- Reveal information hierarchy
- Reduce cognitive load during state changes
- Communicate progress or status

### 4. Precision over novelty
Use the project's established timing tokens, easing curves, and stagger intervals. Random values are sloppy.

### 5. Calm confidence
Think "measured and expensive." The motion should feel like a confident attorney walking into a courtroom — deliberate, composed, authoritative.

---

## Brand Identity (Quick Reference)

Full token details in `references/brand-tokens.md`.

**Colors:** Navy/blue OKLCH palette — primary `oklch(0.45 0.18 260)` (light) / `oklch(0.60 0.20 260)` (dark), hue 260 throughout. Sidebar is very dark navy `oklch(0.17 0.04 260)`. Hardcoded blues: `#2563eb` (blue-600), `#3b82f6` (blue-500), `#1d4ed8` (blue-700).

**Typography:** Inter font family, antialiased. Bold headings (700), semibold subheadings (600).

**Radius:** Base `0.625rem` (10px). Cards use `rounded-xl` (12px). Buttons: `rounded-full` or `rounded-lg`. Popup: `rounded-3xl` (24px).

**Logo assets:**
- Full: `/logo-full.png` — badge + "Talk-To-My Lawyer" text
- Icon: `/logo-icon-badge.png` — square badge with scales
- Component: `<BrandLogo size="sm|md|lg|xl" iconOnly hideWordmarkOnMobile variant="light|dark|sidebar" />`
- Logo animation: Entrance fade + subtle scale is acceptable. No spinning, bouncing, or continuous animation on the logo.

---

## Timing System

### Duration Tokens
| Token | Value | Use for |
|---|---|---|
| ultra-fast | 120ms | Micro-feedback (active states) |
| fast | 180ms | Hover effects, button press |
| base | 240ms | Standard transitions |
| moderate | 320ms | Section reveals, modals |
| slow | 420ms | Hero entrances, complex reveals |
| long | 560ms | Page intro sequences (max) |

### Easing Curves (from codebase)
| Name | Value | When to use |
|---|---|---|
| smooth-out | `cubic-bezier(0.16, 1, 0.3, 1)` | Primary easing — entrances, reveals, cards |
| gentle-in-out | `cubic-bezier(0.45, 0, 0.2, 1)` | Continuous/looping animations |
| decelerate | `cubic-bezier(0, 0, 0.2, 1)` | Ping/glow expansion effects |
| standard | `cubic-bezier(0.22, 1, 0.36, 1)` | General purpose |

### Stagger Intervals
- Card grids: 60–90ms between items
- List items: 40–60ms
- Hero elements: 100–140ms
- Step cards (HowItWorks pattern): `100 + i * 140ms`

---

## Spatial System

### Movement Distances
| Context | Distance |
|---|---|
| Micro UI (tooltips, badges) | 4–8px |
| Small components (buttons, inputs) | 8–12px |
| Cards and tiles | 12–20px |
| Section reveals | 16–24px |
| Hero content | 20–28px max |

Elements should arrive from nearby, not teleport from offscreen.

### Scale Rules
| Context | Scale |
|---|---|
| Hover lift | `1.01` to `1.02` max |
| Modal/popup entrance | `0.9` to `1` (popup-card-in pattern) |
| Button press | `0.98` (active:scale-[0.98]) |
| Step circle active | `1.05` |
| Badge pop | `0` → `1.15` → `1` |

---

## Page-Specific Guidance

### Hero Section
- Headline: fade + 16–24px rise, 600ms smooth-out
- Subheading: stagger 100ms after headline
- CTA group: stagger 140ms after subheading
- Floating card: use existing `.hero-card-float` (6s gentle-float)
- Trust badges: restrained stagger reveal

### Navbar
- Fixed position with `backdrop-blur-md` — subtle, stable
- Nav item hovers: color transition 200ms
- CTA button: shadow enhancement on hover, `active:scale-[0.98]`
- Mobile menu: instant or fast fade (avoid slide-down that feels slow)

### How It Works (scroll sequence)
- **Already fully built** — see `references/animation-inventory.md`
- Scroll-linked progress drives connector fill, orbit circles, card entrances
- Step thresholds at `[0.15, 0.45, 0.72]`
- Burst labels pop and fade over 1400ms
- Completion tick at progress ≥ 0.92
- Full reduced-motion support via `useReducedMotion()` hook
- Do not rebuild this system — extend or adjust values only

### Pricing Cards
- Stagger reveal: `card-lift` pattern, 60–90ms intervals
- Recommended plan: subtle border glow or shadow emphasis
- Price toggle (monthly/yearly): smooth position + number transition
- Hover: 2–4px lift, border or shadow refinement

### Modals & Dialogs
- Backdrop: fade 300ms (use existing `.animate-popup-overlay`)
- Panel: scale 0.9→1 + translateY 20→0 (use existing `.animate-popup-card`)
- Exit: 180ms — faster than entrance
- Focus trap must work — do not animate in a way that breaks it

### Forms & Auth
- Inline validation: small fade reveal
- Step transitions: fade-through with 8–16px horizontal movement
- Button press: `active:scale-[0.98]` (already standard)
- Success confirmation: existing `bounce-in` or `scale-in` for checkmarks
- Error states: subtle red border transition — no shaking entire forms

### Letter Workflow Dashboards
- Progress bar steps: color transition on completion
- Status badges: `transition-colors` — simple, reliable
- Pipeline modal: spinner (`animate-spin`) for active stage
- Skeleton→content: shadcn Skeleton pulse → instant swap (keep it simple)
- Panel switches: fade-through 240ms

### Attorney Review Center
- Queue items: subtle stagger on list load
- Review detail split-pane: no entrance animation needed — instant render
- Action buttons (approve/reject): press feedback via scale
- Status transitions: color-based, not motion-heavy

### Document Analyzer
- Upload zone: subtle scale pulse on drag-over
- Processing state: spinner or progress bar — standard patterns
- Results reveal: fade + 16px rise, stagger for multiple items

### First Visit Popup
- **Already fully built** — uses `.animate-popup-overlay`, `.animate-popup-card`, `.animate-popup-shimmer`, `.animate-popup-icon-glow`, `.animate-popup-pulse`
- CTA: gradient shift on hover, `active:scale-[0.98]`
- Timer: no animation on digits (clean swap)
- Do not modify unless specifically asked

---

## Existing Animation Inventory (Summary)

Full details with code in `references/animation-inventory.md`. Always check there before creating new keyframes.

**Global CSS classes** (index.css):
`animate-bounce-in`, `hero-card-float`, `animate-popup-overlay`, `animate-popup-card`, `animate-popup-shimmer`, `animate-popup-icon-glow`, `animate-popup-pulse`

**HowItWorks inline keyframes:**
`burst-pop-fade`, `tick-entrance`, `tick-glow-ring`, `dot-ping`, `icon-settle`, `card-lift`, `shimmer-line`, `badge-pop`, `subtle-float`

**tw-animate-css utilities:** `animate-spin`, `animate-pulse`

---

## Implementation Preferences

### Priority Order
1. **Reuse existing codebase animations** — check the inventory first
2. **CSS keyframes/transitions** — for simple, one-off interactions
3. **Tailwind utility classes** from `tw-animate-css`
4. **Framer Motion** — only for complex orchestration that CSS cannot handle cleanly
5. Never add GSAP or other heavy libraries without explicit justification

### Component Patterns
Build reusable animation wrappers when a pattern repeats:
- `FadeIn` — opacity + translateY with configurable delay
- `StaggerChildren` — applies stagger to direct children
- `ScaleInModal` — backdrop + panel entrance/exit

Use inline styles for scroll-linked values (the HowItWorks pattern). Use CSS classes for repeatable effects.

### Dark Mode
All animations must work in both light and dark themes. Use CSS custom properties for any color values in animations. The hardcoded blues (`#2563eb`, etc.) are acceptable for accent glows since they work on both backgrounds.

---

## Ready-Made Recipes

### 1. Section Reveal
```css
initial: opacity 0, translateY(20px), filter blur(4px)
animate: opacity 1, translateY(0), filter blur(0)
duration: 420ms smooth-out
stagger children: 60ms
trigger: IntersectionObserver, threshold 0.15
```

### 2. Card Hover
```css
hover: translateY(-3px), box-shadow enhancement
transition: 180ms smooth-out
optional: border-color shift to primary
scale: 1.01 max
```

### 3. Modal Entrance
```css
backdrop: opacity 0→1, 300ms ease-out
panel: opacity 0, scale(0.9), translateY(20px) → opacity 1, scale(1), translateY(0)
panel timing: 400ms smooth-out, 100ms delay after backdrop
exit: 180ms — reverse, no delay
```

### 4. Step/Wizard Transition
```css
outgoing: opacity 1→0, translateX(0→-16px), 180ms
incoming: opacity 0→1, translateX(16px→0), 240ms smooth-out
container: preserve height to prevent layout jump
```

### 5. Button Press
```css
hover: slight brightness/contrast increase, shadow enhancement
active: scale(0.98), 100ms
focus: visible ring (never hidden by animation)
```

### 6. Toast Notification
```css
enter: translateY(-8px)→0, opacity 0→1, 240ms smooth-out
exit: opacity 1→0, 180ms
position: respect existing toast system (sonner)
```

### 7. Skeleton to Content
```css
skeleton: built-in pulse from shadcn Skeleton component
transition: instant swap — do not animate the handoff
the skeleton itself provides the motion cue
```

### 8. Scroll Progress Indicator
```css
width: tracks scroll position 0%→100%
height: 2–3px, fixed top
color: primary gradient
transition: width 80ms linear (matches connector pattern)
```

### 9. Stagger Grid
```css
each item: card-lift keyframe (translateY 40→0, scale 0.97→1)
stagger: 100 + index * 80ms
duration: 700ms smooth-out
trigger: IntersectionObserver
```

### 10. Status Badge Transition
```css
color change: 300ms ease
optional: subtle scale pulse 1→1.05→1 on status update, 400ms
background-color transition for badge bg
```

### 11. Logo Entrance
```css
opacity 0→1, scale(0.95)→1
duration: 420ms smooth-out
sidebar variant: fade only, no scale (stability matters)
never: spin, bounce, continuous animation
```

### 12. Accordion/Expand
```css
height: 0→auto (use grid-rows trick or max-height)
opacity: 0→1, 60ms delay
duration: 280ms smooth-out
content should not shift surrounding layout
```

---

## Performance Rules

### Compositor-Friendly Properties Only
Animate primarily: `transform`, `opacity`, sometimes `filter`
Never animate: `top`, `left`, `width`, `height`, `box-shadow` at high frequency across many elements

### Layout Shift Prevention
- Reserve space before elements animate in
- Use `will-change: transform` sparingly and only on continuously animated elements (like `.hero-card-float`)
- Never let entrance animations push other content around

### Mobile Smoothness
- Test animations at 60fps on mobile
- Reduce complexity on mobile if needed (fewer stagger items, simpler effects)
- The HowItWorks scroll system handles mobile with dot indicators instead of the full connector

### Initial Load Budget
- Do not animate every DOM node on page load
- Animate the hero container and 3–5 key children maximum
- Below-fold content uses IntersectionObserver triggers

---

## Accessibility

### `prefers-reduced-motion`
- Remove non-essential transforms and keyframes
- Keep only opacity transitions where state communication requires them
- The `useReducedMotion()` hook in `HowItWorks.tsx` is the reference pattern:
  ```tsx
  function useReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(mq.matches);
      const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }, []);
    return reduced;
  }
  ```
- For CSS-only animations, use `@media (prefers-reduced-motion: reduce)` to disable

### Focus States
Keyboard focus rings (`outline`, `ring`) must never be hidden or overridden by animation. The project uses `outline-ring/50` as the base.

### Reading Order
Body text must be readable immediately — no delayed reveals on paragraphs. Headlines may fade in softly. Never animate text in a way that blocks comprehension.

---

## Quality Bar

### What "premium legal motion" feels like
- Deliberate, composed, refined
- You notice it subconsciously — it just feels right
- Every element arrives with quiet authority
- State changes are clear and immediate
- The interface feels responsive but never frantic

### What it does NOT feel like
- Startup landing page with parallax everything
- Gaming UI with bouncing elements
- E-commerce site with attention-grabbing pulses on CTAs
- Crypto/NFT site with 3D card flips
- Any motion that makes a user think "this is trying too hard"

### Anti-Patterns to Reject
- Bouncy spring physics on legal content
- Text scramble/typewriter on headlines containing legal terms
- Infinite pulsing on primary CTAs
- Large parallax backgrounds
- Rotating or flipping cards
- Elastic overshoot on modals
- Shaking forms on validation error
- Auto-playing carousels with fast transitions
- Background drift or continuous background motion

### The 15–25% Rule
Your first draft of any animation is probably 15–25% too much. After implementing, review and reduce:
- Distance too far? Cut 20%
- Duration too long? Shave 50–80ms
- Too many things moving? Remove the least important
- Scale change too dramatic? Halve it

---

## Agent Workflow

When asked to animate something:

1. **Check inventory** — Read `references/animation-inventory.md`. Can you reuse an existing keyframe or utility class?

2. **Identify the job** — What is this animation's purpose? If you cannot articulate it (guide attention, confirm interaction, reveal hierarchy, reduce cognitive load, communicate state), do not add it.

3. **Plan before coding** — Define: which elements, what type of motion, timing/easing values, reduced-motion fallback.

4. **Implement** — Use the priority order (existing utilities → CSS → tw-animate-css → Framer Motion). Keep it consistent with the established patterns.

5. **Verify** — Check: mobile smooth? No layout shift? Focus states intact? Reduced motion handled? Works in dark mode?

6. **Trim** — Apply the 15–25% rule. Reduce until it feels just right.

7. **Deliver** — Provide: motion rationale, what was animated, code, reduced-motion handling, performance notes.
