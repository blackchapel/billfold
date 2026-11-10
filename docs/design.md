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

## Do / Don't
Do: left-align text, use the serif for page titles, show empty states that say what happens next.
Don't: gradients, glass, glows, emoji as icons, identical card grids, big rounded cards, decorative illustrations.

## Accessibility
WCAG AA contrast, visible 2px accent focus ring, full keyboard use, labelled controls, scroll regions focusable,
`prefers-reduced-motion` respected. Checked automatically by `pnpm verify:ui` (axe) on every page.
