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
| `--ink` | `#141414` | Primary text, the mark, primary button fill, the active page-pattern chip on the site page |
| `--ink-2` | `#3D3C39` | Secondary body text (dialogs, fact chips) |
| `--mute` | `#8A8A87` | Top-bar links, placeholders, inactive segments and pills, card captions after the name |
| `--faint` | `#B4B3AE` | Tertiary text: counts in menus, trailing icons |
| `--chip` | `#F0EFEC` | Fill of chips, segmented-control tracks, the search field, and card frames behind phone shots, section crops and skeletons |
| `--surface` | `#F7F6F3` | Hover fill |
| `--surface-2` | `#EFEEE9` | Pressed or set state, chip hover |
| `--line` | `#E8E7E3` | Hairline borders on pills, menus, dialogs and card frames |
| `--line-2` | `#DCDBD6` | Borders on active or selected items, outlined chips, hovered card frames |
| `--accent` | `#F2622E` | The only accent. It colors the **icon** of an active item or pill and the focus ring. It is never a surface fill. |
| `--scrim` | `rgba(12,12,12,.9)` | Lightbox backdrop |
| `--chip-dark` | `rgba(240,239,236,.14)` | `--chip` on the dark scrim: the lightbox's domain chip and round buttons |
| `--chip-dark-2` | `rgba(240,239,236,.24)` | Their hover fill |

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
| Site name (site page) | 48px | 500 | `--ink` | `--track-display`; 36px at ≤640px |
| Group title ("Sections"), dialog title | 28px | 500 | `--ink` | `--track-display`; group title 24px at ≤640px |
| Menu item | 14.5px | 400 | `--ink` | Count at 12.5px in `--faint` |

## 3. Spacing and layout

| Token / rule | Value | Use |
|---|---|---|
| `--gutter` | 48px | Page side padding, shared by the top bar and the content. 24px at ≤1100px, 16px at ≤640px |
| Top bar padding | 24px × `--gutter` | 16px tall padding on phones |
| Top-bar end gap | 40px | Between search and About; 20px on phones |
| Brand gap | 10px | Between the mark and the wordmark |
| Sentence filter | max-width 1100px, centred, ~70px above it | 56px from the sentence's count line to the grid |
| Site page | Back link, then the header 40px below, controls 48px below it, attribution 20px below, grid 40px below | Header max-width 900px, centred |
| Browse grid (sites, pages, sections) | 4 columns, 22px column gap, 36px row gap | 3 columns below 1280px, 2 below 960px, 1 below 560px |

White space is the main ornament: prefer more room over more dividers.

## 4. Radius, borders and elevation

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 8px | Phone screenshot inside a card, menu items |
| `--r-md` | 10px | Admin buttons |
| `--r-lg` | 14px | Card frames, menus, lightbox shot, dialog textarea |
| `--r-card` | 24px | Dialogs, the phone bottom sheet |
| `--r-pill` | 999px | Search, chips, segmented controls, dialog inputs and buttons |

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
`0 1px 3px rgba(0,0,0,.1)`.

### Sentence filter (`.sentence`)
On the browse views the headline is the filter, a centred sentence whose chips
are the facets: "Show me [💳 Pricing ▾] [pages ▾] from [🤖 AI ▾] sites, on
[🖥️ desktop ▾]". Sites lead with Industry ("Show me [AI ▾] [sites ▾] on
[any device ▾]"); sections lead with Section type.
- Type: 52px / 500, `--track-display`, line-height 1.45, `--ink`; 30px at
  ≤640px. It wraps naturally, and a connecting word never wraps away from its chip.
- Chips are `.chip` at the sentence's size, ending in a `▾` in `--faint`. An
  unset facet reads "all", "any" or "any device" in `--faint`; a set one reads in
  `--ink` with its emoji (from `lib/taxonomy-emoji.js`, never hard-coded in the
  render code), a country flag, or a color swatch dot.
- The view noun (sites / pages / sections) is a chip too.
- Secondary facets (page type or section where they are not the lead, color,
  theme, country) wait at the end as dashed `+ color` add-chips at UI size
  (36px, 15px, `--line-2` dashed border, `--mute`). Once set they join the
  sentence ("in [● blue ×]", "in [🌙 dark ×] mode", "from [🇯🇵 Japan ×]") with a
  clear (×) in place of the caret. A search query reads "matching [“pricing” ×]".
- Under it, one 17px `--mute` line: the count and the source promise ("214
  pages · every screenshot links back to its source"), plus an underlined
  "Clear" (`.clear-link`) while any filter or query is set.
- The sentence is a `role="group"` with an `aria-label`; each chip's accessible
  name is "Facet: value" (e.g. "Industry: AI").
- Menus keep the UI type, open centred under their chip and are nudged inside
  the window; at ≤640px they open as a full-width bottom sheet.

### Pager (`.pager`)
Browse lists page through numbered links instead of infinite scroll. A `.seg`
track centered below the grid, 56px above and 80px below it, holds the first
and last page, the current page ±2 and `…` gaps in `--faint`. Page links are
30px tall `<a href>` hash links with `--mute` numbers; the current page
(`aria-current="page"`) looks like the active segment. Below 640px the ±2 pages
drop out and 38px `--chip` prev/next arrows flank the track. One page shows no
pager.

### Menus
The **menu** is a white popover with a `--line` border, `--r-lg` and
`--shadow-pop`, 6px below its chip. Items are 34px tall with a count on the right.

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

### Site page (`#/app/<id>`)
- **Back link** (`.back`): "← All sites", 14.5px `--mute` text, top-left under
  the top bar.
- **Header** (`.site-head`), centred: the site name as display type (48px/500,
  `--track-display`), the tagline in `--mute` (17px) below it, then a wrapping row
  of fact chips (`.site-facts`, `.chip` in `--ink-2`): the industry with its
  emoji, the country with its flag, and "N pages". It ends in an outlined
  "Visit domain.com ↗" chip (`.chip-outline`: no fill, a `--line-2` border)
  linking to the source. No logo tile, ours or the site's.
- **Controls** (`.site-controls`), centred: a `.seg` platform switch
  (Desktop | Mobile, only the platforms the site has), then a wrapping row of
  `.chip` buttons for the page patterns present on that platform, led by "All
  pages", each with its pattern emoji. The active chip is an `--ink` fill with
  white text.
- **Attribution** (`.attribution`): "Screenshots captured … from domain", 14.5px
  `--mute`, centred, the domain underlined in `--ink-2`.
- The Pages and Sections grids are the browse grids and cards. "Sections" is a
  `.group-title`: 28px/500, centred, 72px above the grid it heads.

### Lightbox
A full-screen `--scrim` with Esc / ← / → and a focus trap; focus returns to the
card that opened it. The bar: the site name at 500 over a `--mute` caption
(type · path · platform · "2 of 9", one line with ellipsis), then the domain as a
`.chip` link on `--chip-dark` with white text, and a round 40px close button.
The round prev / next buttons share the `--chip-dark` fill (`--chip-dark-2` on
hover). The shot sits in a white `--r-lg` frame and scrolls inside it.

### Dialogs (About, Request removal)
`--r-card` (24px), a `--line` hairline, `--shadow-pop`, 32px padding (24px on
phones), at most 460px wide. The title is display type (28px/500,
`--track-display`), the body `--ink-2`. Inputs are 44px `--r-pill` fields on
`--chip` with no border (the textarea uses `--r-lg`); placeholders are `--mute`
and the focus ring stays `--accent`. An invalid field gets a 1px inset `--ink`
ring. The primary button is a 40px full pill in `--ink` with white text;
secondary actions ("Close") are `.chip` buttons.

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
- **≤640px**: the gutter is 16px, the search field hides behind its icon, the
  site name drops to 36px and dialogs pad 24px. The top bar must fit at 375px.
- There is never any horizontal page scroll.
