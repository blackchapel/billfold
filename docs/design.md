# Design system

Direction: calm, editorial "statement" aesthetic. Paper background, ink text, one restrained accent, hairline borders,
small radii, strong typographic hierarchy. Must not look like a generic AI dashboard.

## Palette (CSS variables in `src/app/globals.css`, Tailwind names in brackets)
| Token | Light | Dark | Use |
|---|---|---|---|
| paper | `#F6F3EC` | `#14130F` | page background |
| surface | `#FBF9F4` | `#1B1A16` | inputs, raised areas |
| ink | `#1B1A17` | `#ECE7DA` | text |
| muted | `#6B665B` | `#9D978A` | secondary text (AA on paper) |
| line | `#DDD7C9` | `#2F2D26` | 1px borders |
| accent | `#1F5C46` | `#6DB596` | primary actions, positive state |
| danger | `#A33A2A` | `#E0806F` | errors, destructive |
| warn | `#8A5A12` | `#D8A24A` | needs attention |
Dark is its own palette, not inverted. Theme follows the system setting.

## Type
Headings and large figures: **Newsreader** (serif). UI text: **Inter**. IDs and codes: **JetBrains Mono**.
Money and tables use tabular numerals (`.num`), always right-aligned. Scale: 12 / 14 / 16 / 20 / 24 / 30 / 36 / 48.

## Shape and space
Radii 2 / 4 / 6px only. Borders 1px `line`. No shadows except focus rings. Spacing on a 4px grid; generous whitespace.
Controls are at least 40px tall (44px for primary mobile actions).

## Components
- Tables: dense, hairline row separators, uppercase small header labels, money right-aligned.
- Buttons: primary (accent fill), secondary (hairline), ghost, danger (outline). No gradients.
- Badges: 1px outline, uppercase 12px, tone by meaning (good, warn, bad, neutral).
- Forms: label above field, hint below, errors in `role="alert"`.
- Charts (later): single colour, thin strokes, no gridline clutter.

## Loading and feedback
Every page has a `loading.tsx` skeleton (`components/features/shell/page-skeleton.tsx`): grey bars shaped and sized like the content they stand in for (title, text lines, buttons, list rows, inputs), each a `.skeleton` with **its own** soft highlight sweeping left to right *inside* the bar, clipped to the bar's shape, while the gaps between bars stay still. All bars share one duration and start together, so the sweeps line up (about 1.6 s, with a short rest). The highlight is the single place a gradient is allowed, and only inside a skeleton bar. It is a `::after` moved with `transform` only, so it runs on the graphics card without repainting; never animate `background-position`, opacity or size, and never lay one overlay across several bars (that reads as a glare over the page, not bars shimmering). Keep the highlight only a little lighter than the bar: a near-white highlight turns light-mode bars into the page colour. With reduced motion the highlight is hidden and the bars are still. Links that open a page use `LinkButton` / `TextLink`, which show a small turning ring at once and a "still loading" note after six seconds. `prefers-reduced-motion` stops all of it.

## Brand files
One mark (a green rounded square with an envelope outline). `src/app/icon.svg` is the source; `scripts/make-brand-assets.mts` draws `public/icon-192.png`, `public/icon-512.png`, `src/app/apple-icon.png` (full square, 180px) and `src/app/opengraph-image.png` (1200x630, paper background, serif headline, green bar). Rerun the script and commit the output only when the brand changes.
In email the wordmark is styled text (never an image). Public pages (`/`, `/privacy`, `/terms`) use the same paper/ink look, one column, numbered list instead of cards.

## Do / Don't
Do: left-align text, use the serif for page titles, show empty states that say what happens next.
Don't: gradients, glass, glows, emoji as icons, identical card grids, big rounded cards, decorative illustrations.

## Accessibility
WCAG AA contrast, visible 2px accent focus ring, full keyboard use, labelled controls, scroll regions focusable,
`prefers-reduced-motion` respected. Checked automatically by `pnpm verify:ui` (axe) on every page.
