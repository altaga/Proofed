# Design System & UI Craft Rules

These standards define the visual language, typography, surface architecture, and accessibility requirements for Proofed.

---

## 1. The Anti-Vibecoding Directive

Proofed rejects generic "AI-generated startup" aesthetics. Avoid:
- Default Tailwind gray card backgrounds (`#F3F4F6`, `bg-gray-100`, `bg-zinc-100`).
- Generic soft, blurry shadows (`shadow-md`, `shadow-lg` diffuse glows).
- Uniform 8px border-radius applied everywhere without rationale.
- Default Tailwind blue (`#3B82F6`) as the primary brand color.
- Symmetrical, low-information "Dribbble-style" mock hero sections.
- Brutalism, loud neon cyberpunks, or overdecorated dashboard chrome.

---

## 2. Target Aesthetic: Swiss Premium & Luxury Fintech

- **Surfaces**: Crisp layered surfaces with intentional hierarchy. Use thin, deliberate separators (`border-stone-200` / `border-neutral-200`) instead of floating containers.
- **Corner Radii**: Deliberate geometry — either nearly sharp (2px–4px) for cards, data grids, and input fields, or fully pill-shaped for badges and status indicators.
- **Color Palette**:
  - Warm off-whites and paper-tone backgrounds (`#FBFBFB`, `#F7F7F6`).
  - Deep graphite and carbon blacks for text (`#111827`, `#0A0A0A`).
  - Single refined accent: Deep cobalt / navy (`#002C6C`, `#001C44`) representing institutional security.
  - Semantic status indicators: Muted emerald (Captured), Amber (Held), Rose/Crimson (Failed/Voided), Violet (Substituted).
- **Typography**:
  - Neutral sans-serif (Plus Jakarta Sans, Inter, SF Pro).
  - Monospace (JetBrains Mono / standard mono) strictly reserved for SKUs, transaction IDs, hashes, and monetary cents.
  - Tight headline tracking (`tracking-tight`) with disciplined vertical rhythm.

---

## 3. Accessibility Standards (WCAG AA)

- All text elements must achieve a minimum color contrast ratio of 4.5:1 against their background (3:1 for large text).
- Semantic HTML elements (`<main>`, `<nav>`, `<aside>`, `<section>`, `<button>`) must be used instead of nested clickable `<div>`s.
- All interactive controls must support visible keyboard focus rings (`focus-visible:ring-2`).
- Reduced motion: Respect `prefers-reduced-motion` for all transitions and status indicators.
- Axe-core accessibility automated checks must pass without contrast or aria violations (`npm run test:e2e`).
