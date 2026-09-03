# Storovex — Figma Design Selection

> **STATUS: PROVISIONAL — no Figma file has been inspected yet.**
> This document records a direction derived from the two specification files only.
> It is not a Figma finding. See §1 for exactly what is blocked and what unblocks it.

Date: 2026-09-03

---

## 1. Why this is provisional

The Figma connector is authenticated and working:

```
handle: Saad Saad Ali
email:  saaadaliii145490@gmail.com
plan:   "Saad Saad Ali's team" — tier: starter, seat: View
```

**No design was inspected, and none is described below as if it had been.**

Every Figma read tool exposed here — `get_metadata`, `get_design_context`,
`get_screenshot`, `get_libraries`, `search_design_system` — takes a **required
`fileKey`**. The MCP server provides no tool to list, browse or search the files in a
team, so there is no path from "connector is authenticated" to "here is what is in
the workspace" without a file reference.

Two further constraints, worth knowing before you pick a file:

| Constraint | Consequence |
|---|---|
| Seat is **View**, not Edit | Reading designs works. Writing designs back into Figma (`use_figma`, `create_new_file`, `generate_figma_design`) will not. |
| Team tier is **starter** | Published team libraries and shared variables are a paid-tier feature, so `get_libraries` and `search_design_system` will likely return little even with a valid key. Expect to extract tokens by reading frames rather than by pulling variables. |

### What unblocks this

One URL, ideally with a node id:

```
https://figma.com/design/<fileKey>/<fileName>?node-id=1-2
```

Given that, I will inspect the pages, frames, components, typography ramp, spacing
system, colour usage and responsive intent, and rewrite this document from what is
actually in the file — including which direction I selected, which frames it came
from, and what I deliberately did not carry over.

If the workspace turns out to have no Storovex design at all, that is a perfectly
good answer too, and this provisional direction becomes the real one.

---

## 2. Provisional direction — Premium Modern Commerce + AI SaaS

Taken from `Storovex_Figma_Premium_Frontend_Master_Command.md` §"Recommended Visual
Direction" and `Storovex_Master_5_Phase_Figma_Integrated_Command.md` Phase 4.

- Dashboard: dark-first professional workspace.
- Storefront / marketing: clean, light, conversion-focused.
- Violet as the brand and primary-action colour; cyan reserved for AI affordances only.
- Premium neutral surfaces, crisp borders, subtle depth. Restrained glass/blur.
- Strong typographic hierarchy, generous but controlled whitespace.
- Explicitly **not** neon, gaming-like or excessively futuristic.

### Tokens (from the specs, to be reconciled against Figma once available)

| Role | Value |
|---|---|
| Primary | `#7C3AED` |
| Primary hover | `#6D28D9` |
| Secondary | `#8B5CF6` |
| AI accent | `#06B6D4` |
| Blue / Indigo | `#3B82F6` / `#6366F1` |
| Success / Warning / Error | `#10B981` / `#F59E0B` / `#EF4444` |

Dark surfaces: `#09090B` bg · `#111113` surface · `#18181B` elevated · `#27272A` border ·
`#FAFAFA` text · `#A1A1AA` secondary · `#71717A` muted

Light surfaces: `#FAFAFA` bg · `#FFFFFF` surface · `#F4F4F5` secondary · `#E4E4E7` border ·
`#18181B` text · `#52525B` secondary · `#71717A` muted

Typography: Inter, loaded via `next/font` (the current CSS declares font families that
are never actually loaded — see AUDIT_REPORT §5 B14).
Ramp: Hero 56–72 · H1 40–48 · H2 32–40 · H3 24–30 · Body 14–16 · UI 13–14 · Small 12.

Spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 96 / 128
Radius: 6 / 8 / 10 / 12 / 16 / 20 / 24 — buttons 8–10, inputs 10–12, cards 12–16,
large marketing surfaces 16–24.

Motion: Fast 120–180ms · Normal 180–280ms · Emphasis 300–450ms · Marketing 400–700ms.
Transform and opacity only. `prefers-reduced-motion` respected throughout.

---

## 3. What this direction replaces, and what it costs

The current codebase implements a **different and internally coherent** design
language: seven themes named for places in a photo studio — Daylight Studio,
Blackout, Contact Sheet, Darkroom Safelight, Slate, High Contrast, Sepia Print —
with a deep developer-tray green accent (`#2a4d46`) and a Space Grotesk / Inter /
IBM Plex Mono stack. It is well-executed and it fits the product the repository
actually builds (AI product photography).

Adopting the spec direction means retiring it. That is a real cost and it should be a
deliberate choice, not a side effect. Two things are worth carrying forward regardless
of which direction wins:

1. **The High Contrast theme.** It is a genuine WCAG-AAA-oriented accessibility
   affordance, not a style. Keep it as a supported mode in the new system.
2. **The theming architecture itself** — `data-theme` attribute + CSS custom
   properties. It is the right mechanism; only the token values need to change.

## 4. What is not decided here

- Whether Storovex is an AI product photography tool or an AI store builder.
  That is AUDIT_REPORT §16 and it is yours to decide; the visual direction above
  works for either, but the screen inventory does not.
- Any component-level specification. That comes from the Figma file.
- Whether to adopt Tailwind. Strongly recommended in AUDIT_REPORT §17 Phase 4 for
  reasons independent of Figma: the current inline-style architecture cannot express
  `:hover`, `:focus`, `:active`, `:disabled` or `@media` at all.

---

## 5. Rules being followed

- Figma is the design source of truth; the repository and database are the source of
  truth for functionality, data and security.
- No other company's interface or branding will be copied.
- No fabricated testimonials, customer logos, revenue figures or awards.
- Real backend functionality, security and accessibility are preserved through any
  redesign.
- No claim that a design "works" without a browser pass and evidence.
