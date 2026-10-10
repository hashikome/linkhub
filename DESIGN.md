---
name: "nslinkhub"
description: "A dependable personal library: legible titles, clear destinations, visible structure."
colors:
  canvas: "oklch(1 0 0)"
  surface: "oklch(0.97 0.004 265)"
  ink: "oklch(0.22 0.01 265)"
  muted: "oklch(0.48 0.012 265)"
  border: "oklch(0.64 0.01 265)"
  divider: "oklch(0.91 0.006 265)"
  primary: "oklch(0.47 0.13 255)"
  primary-hover: "oklch(0.41 0.12 255)"
  primary-pressed: "oklch(0.36 0.1 255)"
  primary-soft: "oklch(0.95 0.02 255)"
  on-primary: "oklch(1 0 0)"
  focus: "oklch(0.47 0.13 255)"
  notice: "oklch(0.96 0.045 95)"
  notice-ink: "oklch(0.42 0.08 75)"
  danger: "oklch(0.48 0.17 25)"
  danger-soft: "oklch(0.955 0.022 25)"
  success: "oklch(0.45 0.1 155)"
  success-soft: "oklch(0.96 0.025 155)"
typography:
  family: "Schibsted Grotesk (self-hosted, variable), system sans fallback"
  page: { fontSize: "2.125rem", lineHeight: "2.5rem", fontWeight: 650, letterSpacing: "-0.025em" }
  section: { fontSize: "1.25rem", lineHeight: "1.75rem", fontWeight: 650, letterSpacing: "-0.015em" }
  row: { fontSize: "1.0625rem", lineHeight: "1.5rem", fontWeight: 600 }
  body: { fontSize: "1rem", lineHeight: "1.5rem", fontWeight: 400 }
  meta: { fontSize: "0.875rem", lineHeight: "1.25rem", fontWeight: 400 }
rounded:
  control: "0.5rem"
  panel: "0.75rem"
  tag: "0.375rem"
spacing:
  unit: "0.25rem"
  control-height: "2.375rem (2.75rem on coarse pointers)"
  button-height: "2rem (2.75rem on coarse pointers)"
  shell-max: "70rem"
  reader-max: "48rem"
---

# Design System: nslinkhub

## Overview

**Creative north star: "A dependable personal library."** A clearly labelled
personal reference shelf, open in daylight: legible titles, clear destinations
and visible structure, with reading given the most space. Nothing is invented to
fill a page — no counts, decorative covers, recommendations or social proof.

**Key characteristics:**

- One confident library-ink blue for actions, links, focus and selection;
  titles stay ink. Chromatic emphasis stays below roughly ten percent of a page.
- Light, Dark and System appearances from one set of semantic OKLCH tokens.
- One self-hosted sans (Schibsted Grotesk) with fixed rem product typography.
- Grouping through separators and surface changes, not shadows or panels.
- The lowercase wordmark `nslinkhub` alone is the logo — no icon.
- UX over compactness; copy in short, scannable paragraphs (see the
  [interface system](docs/design-docs/web-interface-system.md) principles).

This document owns every concrete theme value. Layouts, components and states
are in the [interface system](docs/design-docs/web-interface-system.md); journeys
and copy in the [product experience](docs/design-docs/web-product-experience.md).
`apps/web/src/app/globals.css` installs these tokens.

## Colors

The web's global stylesheet exposes semantic Tailwind theme variables for
canvas, surface, ink, muted text, border, accent, focus and feedback. Components
consume those roles rather than raw palette numbers. All color values use
OKLCH. Light, Dark and System themes are available from the header toggle.
System follows `prefers-color-scheme`; a validated theme cookie selects explicit
light/dark server-side without a client flash. Account data is never stored in it.

Mood: a clearly labelled personal reference shelf, open in daylight. The
primary is a confident library-ink blue (hue 255); neutrals carry a faint tint
toward it (hue 265) so canvas, text and accent read as one family. Row and
collection titles stay ink; accent marks actions, inline links, focus and
selection only (2026-10-07 visual-system pass, superseding the original hue 230). Pure white carries the reading surface, neutral grays distinguish
controls, and chromatic emphasis stays below roughly ten percent of the page.
The pale notice accent is reserved for meaningful warnings, not decoration.

### Canonical color and type variables

For Tailwind's CSS theme namespace, the following block is installed in the
global stylesheet. Theme colors create semantic utilities such as `bg-canvas`
and `text-ink`; custom type roles create `text-page` and `text-body`.
See the official [theme variable reference](https://tailwindcss.com/docs/theme).
Do not copy a second palette into components or email templates.

```css
@theme {
  --color-canvas: light-dark(oklch(1 0 0), oklch(0.205 0.008 265));
  --color-surface: light-dark(oklch(0.97 0.004 265), oklch(0.245 0.01 265));
  --color-ink: light-dark(oklch(0.22 0.01 265), oklch(0.95 0.004 265));
  --color-muted: light-dark(oklch(0.48 0.012 265), oklch(0.74 0.012 265));
  --color-border: light-dark(oklch(0.64 0.01 265), oklch(0.55 0.012 265));
  --color-divider: light-dark(oklch(0.91 0.006 265), oklch(0.3 0.01 265));
  --color-primary: light-dark(oklch(0.47 0.13 255), oklch(0.76 0.11 255));
  --color-primary-hover: light-dark(oklch(0.41 0.12 255), oklch(0.82 0.09 255));
  --color-primary-pressed: light-dark(oklch(0.36 0.1 255), oklch(0.71 0.11 255));
  --color-primary-soft: light-dark(oklch(0.95 0.02 255), oklch(0.29 0.045 255));
  --color-on-primary: light-dark(oklch(1 0 0), oklch(0.18 0.02 255));
  --color-focus: light-dark(oklch(0.47 0.13 255), oklch(0.76 0.11 255));
  --color-notice: light-dark(oklch(0.96 0.045 95), oklch(0.28 0.035 90));
  --color-notice-ink: light-dark(oklch(0.42 0.08 75), oklch(0.88 0.08 85));
  --color-danger: light-dark(oklch(0.48 0.17 25), oklch(0.74 0.13 25));
  --color-danger-soft: light-dark(oklch(0.955 0.022 25), oklch(0.27 0.04 25));
  --color-success: light-dark(oklch(0.45 0.1 155), oklch(0.78 0.1 155));
  --color-success-soft: light-dark(oklch(0.96 0.025 155), oklch(0.26 0.035 155));
  --font-sans:
    var(--font-brand), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --text-meta: 0.875rem;
  --text-meta--line-height: 1.25rem;
  --text-body: 1rem;
  --text-body--line-height: 1.5rem;
  --text-row: 1.0625rem;
  --text-row--line-height: 1.5rem;
  --text-section: 1.25rem;
  --text-section--line-height: 1.75rem;
  --text-page: 2.125rem;
  --text-page--line-height: 2.5rem;
  --text-page--letter-spacing: -0.025em;
  --spacing: 0.25rem;
  --radius-control: 0.5rem;
  --radius-panel: 0.75rem;
  --radius-tag: 0.375rem;
  --ease-feedback: cubic-bezier(0.22, 1, 0.36, 1);
}
```

Use `divider` only for decorative list separation. Inputs, secondary buttons
and other boundaries needed to identify a control use `border`. Body,
placeholder and disabled-control text use `ink` or `muted`, never a lighter
unverified gray. Do not dim whole controls with opacity; use surface plus
muted text and a disabled attribute. Pending controls preserve their label
and announce progress. Selection uses primary-soft with primary text; status
labels use the matching soft background and foreground. Focus uses the
outline with a canvas gap, including around primary-filled controls.

### Contrast evidence (light)

Recalculated 2026-10-07 from OKLCH to linear sRGB using the OKLab inverse matrix
and relative luminance `0.2126 R + 0.7152 G + 0.0722 B`; contrast is
`(lighter + 0.05) / (darker + 0.05)`. All listed colors are inside sRGB gamut;
ratios below are rounded to two decimals. This validates the chosen tokens,
not every eventual rendered combination. Recheck screenshots and computed
styles when the web exists, including hover, focus and background variants.

| Foreground / background | Ratio |
| --- | --- |
| ink / canvas | 17.32:1 |
| ink / surface | 15.88:1 |
| muted / canvas | 6.54:1 |
| muted / surface | 6.00:1 |
| on-primary / primary | 6.88:1 |
| on-primary / primary-hover | 8.90:1 |
| on-primary / primary-pressed | 10.92:1 |
| primary / canvas | 6.88:1 |
| primary / primary-soft | 5.95:1 |
| border / canvas | 3.36:1 |
| border / surface | 3.08:1 |
| notice-ink / notice | 7.66:1 |
| danger / danger-soft | 6.22:1 |
| success / success-soft | 6.36:1 |
| focus / canvas | 6.88:1 |

### Dark mode

Dark mode keeps the same semantic roles with a neutral charcoal canvas, lighter text,
readable blue actions and distinguishable form boundaries. Components inherit
these tokens, including error, success, focus, hover and native control colors.
`globals.css` is the exact palette source; verify the dark contrast pairs as part
of browser acceptance. Motion respects reduced-motion preferences.

Signed-out visitors always follow the system color preference, even when the
browser retains an earlier appearance cookie. Saved Light/Dark/System preferences
apply only with a currently valid session; preference changes require sign-in.

#### Dark contrast evidence

Recalculated 2026-10-07 using the same OKLab-to-linear-sRGB luminance method above.
Body/muted/feedback pairs exceed 4.5:1; control boundaries exceed 3:1.

| Foreground / background | Ratio |
| --- | --- |
| ink / canvas | 15.48:1 |
| ink / surface | 14.03:1 |
| muted / canvas | 7.77:1 |
| muted / surface | 7.04:1 |
| on-primary / primary | 8.77:1 |
| on-primary / primary-hover | 10.79:1 |
| on-primary / primary-pressed | 7.31:1 |
| primary / canvas | 8.35:1 |
| primary / primary-soft | 6.58:1 |
| border / canvas | 3.69:1 |
| border / surface | 3.34:1 |
| notice-ink / notice | 10.15:1 |
| danger / danger-soft | 6.27:1 |
| success / success-soft | 7.98:1 |
| focus / canvas | 8.35:1 |


## Typography, spacing and shape

| Role | Value |
| --- | --- |
| Sans family | Schibsted Grotesk variable (OFL-1.1), self-hosted from `apps/web/src/fonts/` via `next/font/local`; system sans as metric-adjusted fallback |
| Small metadata | `0.875rem / 1.25rem`; regular |
| Body and controls | `1rem / 1.5rem`; regular, controls medium |
| Resource/row title | `1.0625rem / 1.5rem`; semibold, ink (not accent) |
| Section heading | `1.25rem / 1.75rem`; weight 650, `-0.015em` |
| Page heading | `2.125rem / 2.5rem` (`1.875rem` below 640 px); weight 650, `-0.025em` tracking |
| Wordmark | The text `nslinkhub` alone is the logo (no icon), `1.125rem`; bold, `-0.025em` tracking |
| Spacing unit | `0.25rem`; use 1, 2, 3, 4, 5, 6, 8, 10, 12 units |
| Page gutters | `1.25rem` below 640 px; `2rem` above |
| Shell maximum | `70rem` |
| Reader maximum | `48rem`; descriptions max `70ch` |
| Control height | Fields and header utility controls use `--control`: `2.375rem` (38 px). Primary, secondary and text buttons use `--button-control`: `2rem` (32 px), `0.875rem` text, weight 500, and `0.25rem 0.625rem` padding. Both tokens become `2.75rem` (44 px) under `pointer: coarse`. Filled/outlined contrast and focus states are retained |
| Control radius | `0.5rem` |
| Panel radius | `0.75rem`; list rows do not need enclosing panels |
| Tags | `0.375rem` radius, 1px divider outline, muted `0.8125rem` text; not interactive. Resource tags sit inline after the hostname |
| Border | `1px`; no decorative accent side-stripes |
| Focus | `2px` solid outline with `3px` offset (`1px` on text fields, whose border also turns focus-colored) |
| Motion | `160ms`, `cubic-bezier(0.22, 1, 0.36, 1)`; immediate for reduced motion |
| Layers | content 0, sticky 10, dropdown 20, modal backdrop 30, modal 40, toast 50, tooltip 60 |

Product pages use fixed rem typography. The landing hero scales from 2.5rem to
3.5rem with -0.035em tracking at weight 700. Text wraps with balanced
headings, normal readable prose, and `overflow-wrap: anywhere` for user content.
Controls and focus outlines remain visible at zoom. Avoid decorative shadows;
separators or surface changes establish grouping. The one elevation token
(`--elevation`) is reserved for surfaces that float above content: the account
menu popup and the landing example sheet.

## Components

The header separates the left wordmark from Explore and the avatar-only account menu on the right. The menu groups Profile, Hub (when owned),
Notifications (with an unread count), Settings and role-gated Manage above
Sign out. The footer stacks “© <current year> nslinkhub” above the smaller, muted
"an ns series product" line on the left, with a muted, vertically centered Support
link on the right at the same font size as header navigation (wrapping below on
phones). The footer sits at the viewport bottom on short pages and follows
content at the end of long pages; it never stays pinned during document scrolling.
Sharing UI is deferred; there is no footer Discover
link, status link or appearance control. Generated geometric SVGs
come from the API, seeded by immutable user UUID. The approved avatar palette
and grid geometry stay fixed in both themes; no external provider is involved.

The account-menu trigger shows only the avatar, and Notifications sits directly
below Profile inside the popup.

Buttons, fields, tags, toasts, the verification screens and every other
component are specified in the
[interface system](docs/design-docs/web-interface-system.md).

## Do's and Don'ts

**Do:** consume semantic roles (`bg-canvas`, `text-ink`), never raw palette
numbers; keep accent for actions, inline links, focus and selection; keep
labels visible and controls at the shared height; show fewer items rather than
crowd a layout.

**Don't:** copy a second palette into components or email templates; add
decorative shadows, accent side-stripes or icons beside the wordmark; dim whole
controls with opacity; use the pale notice color as decoration.
