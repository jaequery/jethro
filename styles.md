# Jethro style guide

Jethro is a quiet, white library UI with lots of space, warm grey chips and
large, tightly tracked type. A slim top bar carries the brand, search and About,
and everything else sits in the page below it.

The look is Jethro's own. Do not borrow another product's signature pieces
(for example an outlined pill drawn around the wordmark).

The tokens below are the source of truth, and `app/styles.css` implements them
as custom properties on `:root`. Do not hard-code new colors or radii.

---

## 1. Color

Every neutral sits in one warm family: greys lean slightly yellow, never blue.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FFFFFF` | Page background, active segment, popovers |
| `--ink` | `#141414` | Primary text, the mark, primary button fill, logo tiles |
| `--ink-2` | `#3D3C39` | Secondary body text (dialogs, fact chips) |
| `--mute` | `#8A8A87` | Top-bar links, placeholders, inactive segments and pills, captions |
| `--faint` | `#B4B3AE` | Tertiary text: counts in menus, trailing icons |
| `--chip` | `#F0EFEC` | Fill of chips, segmented-control tracks and the search field |
| `--surface` | `#F7F6F3` | Hover fill, screen tiles |
| `--surface-2` | `#EFEEE9` | Pressed or set state, tile hover, chip hover |
| `--line` | `#E8E7E3` | Hairline borders on pills, menus and dialogs |
| `--line-2` | `#DCDBD6` | Borders on active or selected items, outline button |
| `--accent` | `#F2622E` | The only accent. It colors the **icon** of an active item or pill and the focus ring. It is never a surface fill. |
| `--scrim` | `rgba(12,12,12,.9)` | Lightbox backdrop |

Emoji may appear inside filter chips as content (for example "💳 Pricing").
They are data, not an accent, and they never replace `--accent` for state.

**Card backdrops.** Each site has a two-stop tone (`tone_a`, `tone_b`) from the
pipeline, drawn as `radial-gradient(120% 110% at 50% 45%, t1, t2)` with a soft
dark vignette on top. These colors are data, not theme tokens.

## 2. Typography

Font: **Inter Tight** (Google Fonts, weights 400/500/600/700, loaded in
`app/layout.jsx`), falling back to `ui-sans-serif, -apple-system, Segoe UI`.
Antialiasing is `antialiased`.

Tracking tokens:

| Token | Value | Use |
|---|---|---|
| `--track` | `-0.02em` | Default for all UI text |
| `--track-tight` | `-0.03em` | Card names, section titles |
| `--track-display` | `-0.04em` | Display type: the wordmark, page headlines, empty-state and dialog titles |

Display headings are weight **500**, never bold. Only the wordmark uses 600.

| Role | Size | Weight | Color | Notes |
|---|---|---|---|---|
| Wordmark | 24px | 600 | `--ink` | `--track-display`, line-height 1 |
| Top-bar link ("About") | 17px | 400 | `--mute` → `--ink` on hover | |
| Search input | 16px | 400 | `--ink` (placeholder `--mute`) | |
| Chip, segment, pill label | 15px | 400 | `--ink` / `--mute` | Inactive segments and pills are `--mute` |
| Site name (card) | 20px | 500 | `--ink` | `--track-tight`, line-height 1.2 |
| Tagline, caption | 14.5px | 400 | `--mute` | |
| Detail title | 30px | 500 | `--ink` | |
| Menu item | 14.5px | 400 | `--ink` | Count at 12.5px in `--faint` |

## 3. Spacing and layout

| Token / rule | Value | Use |
|---|---|---|
| `--gutter` | 48px | Page side padding, shared by the top bar and the content. 24px at ≤1100px, 16px at ≤640px |
| Top bar padding | 24px × `--gutter` | 16px tall padding on phones |
| Top-bar end gap | 40px | Between search and About; 20px on phones |
| Brand gap | 10px | Between the mark and the wordmark |
| Toolbar gap | 6px | Plus a 1×22px divider after the view switch (hidden on phones) |
| Toolbar to content | 30px | |
| Site grid | 2 columns, 16px column gap, 52px row gap | 1 column at ≤860px |
| Screen grid | auto-fill, min 200px, 16px column gap, 36px row gap | 2 columns at ≤860px |

White space is the main ornament: prefer more room over more dividers.

## 4. Radius, borders and elevation

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 8px | Web screenshot inside a card, menu items |
| `--r-md` | 10px | Buttons, logo tiles, phone screenshots |
| `--r-lg` | 14px | Menus, large logo, lightbox shot |
| `--r-card` | 24px | Card frames, screen tiles, dialog |
| `--r-pill` | 999px | Search, chips, segmented controls, pills |

The top bar has no border. Chips, segments and the search field have no border
either; their `--chip` fill is the edge. Other borders are 1px hairlines
(`--line` / `--line-2`). The only shadows are:

- the active segment: `0 1px 3px rgba(0,0,0,.1)`
- a lifted screenshot inside a card frame: `0 10px 30px rgba(0,0,0,.18)`
- a screenshot inside a tile: `0 1px 2px rgba(0,0,0,.06), 0 6px 18px rgba(0,0,0,.06)`
- popovers: `--shadow-pop` = `0 12px 32px rgba(0,0,0,.1), 0 2px 6px rgba(0,0,0,.05)`

## 5. Iconography

Line icons are drawn on a 24px grid, displayed at 20px (18px inside the search
field), with 1.6 stroke width and round caps and joins, stroked in
`currentColor`. An icon turns `--accent` only when its item or pill is active.
Chevrons and clear buttons are 14px in `--mute`.

## 6. Components

### Top bar (`.topbar`)
- **Left**: the brand link (`.brand`, to `#/apps`): Jethro's 32px circle-"j"
  mark (stroked in `currentColor`, `--ink`) next to the **"Jethro" wordmark**
  (`.wordmark`). The wordmark is plain type, with no outline or pill around it.
- **Right** (`.topbar-end`): the search field, then an "About" text link
  (`.top-link`) that opens the About dialog.
- No border, no fill, no shadow.

### Search (`.search`)
A borderless pill with the `--chip` fill, 40px tall and 320px wide, that widens
to 440px on focus (0.2s). A leading 18px search icon sits in `--mute`; a clear
(×) button appears while a query is present. `#q` is a combobox: suggestions
open in a `.suggest` popover (styled like a menu) under the field, at least
360px wide and right-aligned to it. Pressing `/` focuses it.

**≤640px**: the field hides behind a 40px search icon button
(`.search-toggle`). Tapping it (or pressing `/`) adds `.search-open` to the top
bar and the field covers the bar at 44px tall. It closes on blur once the query
is empty, and stays open while a query is set.

### Chip (`.chip`)
An inline pill: `--chip` fill, `--r-pill`, no border, 36px tall, 14px side
padding, 15px `--ink` text. An optional emoji or 20px icon sits on the left with
an 8px gap. As a `<button>` it takes `--surface-2` on hover.

### Segmented control (`.seg`)
A `--chip` track with 4px padding and `--r-pill`. Segments are 30px tall
buttons with 14px side padding and `--mute` labels. The active segment
(`aria-pressed="true"`) is `--bg` white with `--ink` text and
`0 1px 3px rgba(0,0,0,.1)`. The browse toolbar's Sites / Screens / Sections
switch is a `.seg`.

### Toolbar
The `.seg` view switch, a divider, the **Platform** menu pill, the filters
toggle (its menus stay collapsed until opened), and a small "Clear" text link
(`.clear-link`, `--mute`) while any filter or query is set. The result count
sits at the far right in `--mute`.

### Pager (`.pager`)
Browse lists page through numbered links instead of infinite scroll. A `.seg`
track centered below the grid, 56px above and 80px below it, holds the first
and last page, the current page ±2 and `…` gaps in `--faint`. Page links are
30px tall `<a href>` hash links with `--mute` numbers; the current page
(`aria-current="page"`) looks like the active segment. Below 640px the ±2 pages
drop out and 38px `--chip` prev/next arrows flank the track. One page shows no
pager.

### Pills and menus
37px tall, full pill, a 1px `--line` border on white, 12px left and 16px right
padding, 9px icon gap.
- Inactive: `--mute` label with an `--ink` icon.
- Active or set (`aria-pressed="true"` / `.is-set`): `--surface-2` fill, a
  `--line-2` border, an `--ink` label and an `--accent` icon.
- Menu pills end in a chevron; once a value is set it becomes a clear (×).
- The **menu** is a white popover with a `--line` border, `--r-lg` and
  `--shadow-pop`, 6px below its pill. Items are 34px tall with a count on the right.

### Site card
- **Frame**: aspect ratio 511 / 314, `--r-card`, the site's tone gradient and
  vignette.
- **Desktop cover**: the 16:10 home-page screenshot inset 5.9% left and 9.6%
  top/bottom, `--r-sm`, lifted shadow. Centred when the site has no mobile screen.
- **Mobile cover**: a 9:19.5 phone screenshot, 72% of the frame tall,
  overlapping the desktop cover at the right, `--r-md`.
- On hover the screenshot rises 4px and scales to 1.01 over 0.35s.
- **Meta row**: a 45px `--ink` initial tile (never the site's own logo), then
  the name over "domain — tagline" in `--mute`. The source domain is always shown.

### Screen and section tiles
A 4/5 tile with a `--surface` fill, `--r-card` and 22px padding, screenshot
centred. Section tiles are 16:10 with the crop fitted at its own aspect. The
caption shows a 24px initial tile, the site name (500) and the pattern (`--mute`).

### Site detail, lightbox, dialogs
Unchanged by the top-bar redesign for now: a back link, 64px logo tile and 30px
title, fact chips, and the source credit; a full-screen `--scrim` lightbox with
Esc / ← / → and a focus trap; dialogs with `--r-card` and `--shadow-pop`.

### Empty state
Centred: a "No matches" title (22/500) and a muted line, with an outline
"Clear filters" button.

## 7. Motion
Short and quiet. Hover lifts take 0.3–0.35s ease, fills 0.2s, the search
field's width 0.2s. No entrance animation.

## 8. Responsive
- **≤1100px**: the gutter shrinks to 24px.
- **≤860px**: the site grid becomes 1 column and the screen grid 2 columns.
- **≤640px**: the gutter is 16px, the search field hides behind its icon, and
  the toolbar divider is hidden. The top bar must fit at 375px.
- There is never any horizontal page scroll.
