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
| `--mute` | `#8A8A87` | Top-bar links, placeholders, inactive segments and pills, card captions after the name |
| `--faint` | `#B4B3AE` | Tertiary text: counts in menus, trailing icons |
| `--chip` | `#F0EFEC` | Fill of chips, segmented-control tracks, the search field, and card frames behind phone shots, section crops and skeletons |
| `--surface` | `#F7F6F3` | Hover fill |
| `--surface-2` | `#EFEEE9` | Pressed or set state, chip hover |
| `--line` | `#E8E7E3` | Hairline borders on pills, menus, dialogs and card frames |
| `--line-2` | `#DCDBD6` | Borders on active or selected items, outline button, hovered card frames |
| `--accent` | `#F2622E` | The only accent. It colors the **icon** of an active item or pill and the focus ring. It is never a surface fill. |
| `--scrim` | `rgba(12,12,12,.9)` | Lightbox backdrop |

Emoji may appear inside filter chips as content (for example "💳 Pricing").
They are data, not an accent, and they never replace `--accent` for state.

Cards have no backdrop color: a screenshot sits in a white frame with a
`--line` hairline, and phone shots, section crops and skeletons sit on `--chip`.

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
| Card caption | 15px | 400 | `--mute` | One line with ellipsis; the lead name is 500 in `--ink` |
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
| Toolbar to content | 30px | Browse grids and their empty states start 70px down |
| Browse grid (sites, pages, sections) | 4 columns, 22px column gap, 36px row gap | 3 columns below 1280px, 2 below 960px, 1 below 560px |

White space is the main ornament: prefer more room over more dividers.

## 4. Radius, borders and elevation

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 8px | Phone screenshot inside a card, menu items |
| `--r-md` | 10px | Buttons, logo tiles |
| `--r-lg` | 14px | Card frames, menus, large logo, lightbox shot |
| `--r-card` | 24px | Dialog |
| `--r-pill` | 999px | Search, chips, segmented controls, pills |

The top bar has no border. Chips, segments and the search field have no border
either; their `--chip` fill is the edge. Other borders are 1px hairlines
(`--line` / `--line-2`). The only shadows are:

- the active segment: `0 1px 3px rgba(0,0,0,.1)`
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

### Pills and menus
37px tall, full pill, a 1px `--line` border on white, 12px left and 16px right
padding, 9px icon gap.
- Inactive: `--mute` label with an `--ink` icon.
- Active or set (`aria-pressed="true"` / `.is-set`): `--surface-2` fill, a
  `--line-2` border, an `--ink` label and an `--accent` icon.
- Menu pills end in a chevron; once a value is set it becomes a clear (×).
- The **menu** is a white popover with a `--line` border, `--r-lg` and
  `--shadow-pop`, 6px below its pill. Items are 34px tall with a count on the right.

### Cards (`.card`)
Site, page and section cards share one shape: a **frame** and a **caption**.
- **Frame** (`.frame`): 16:10, `--r-lg`, a 1px `--line` hairline,
  `overflow: hidden`, no shadow and no backdrop. A desktop shot fills it edge
  to edge, cropped from the top. A phone shot (`.is-mobile`) sits centred on
  `--chip` at 86% of the frame height with `--r-sm`. A section crop
  (`.is-section`) is full width on `--chip`, centred when short and cropped from
  the top when tall. Skeletons are the same frame on `--chip`.
- **Caption** (`.cap`): one 15px line with ellipsis, 12px below the frame. The
  lead is 500 `--ink`, then ` · `-separated details in `--mute`:
  - site card: **Name** · industry · domain (desktop shot only; phone shot when
    the site has no desktop one)
  - page card: **Site** · pattern · domain
  - section card: **Site** · section type
  - on a site's own page: **Pattern** · path, or **Section type** · path
- No logo tile on cards, and never the site's own logo. The source domain is
  shown on every site and page card.
- **Hover**: the frame border goes to `--line-2` and the image scales to 1.015
  over 0.2s. `prefers-reduced-motion` turns the scale off.

### Site detail, lightbox, dialogs
Unchanged by the top-bar redesign for now: a back link, 64px logo tile and 30px
title, fact chips, and the source credit; a full-screen `--scrim` lightbox with
Esc / ← / → and a focus trap; dialogs with `--r-card` and `--shadow-pop`.

### Empty and error states
Centred: a display title (28px/500, `--track-display`), a muted line, and a
`.chip` button with an icon ("Clear filters", "Try again"). "No sites yet" has
no button. The "Couldn't load more" retry under a list is a `.chip` too.

## 7. Motion
Short and quiet. Card hover (border and 1.015 image scale) takes 0.2s ease,
fills 0.2s, the search field's width 0.2s. No entrance animation, and no scale
under `prefers-reduced-motion`.

## 8. Responsive
- **≤1100px**: the gutter shrinks to 24px.
- **<1280px / <960px / <560px**: the browse grids go to 3, 2 and 1 columns.
- **≤640px**: the gutter is 16px, the search field hides behind its icon, and
  the toolbar divider is hidden. The top bar must fit at 375px.
- There is never any horizontal page scroll.
