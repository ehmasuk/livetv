---
name: LiveTVFree
description: "Watch live TV channels from public playlists — sports, news, entertainment and more. Browse working channels, test streams in your browser, and find the ones that play."
colors:
  broadcast-red: "#ef4444"
  slate-50: "#f8fafc"
  slate-950: "#020617"
  ink: "#0f172a"
  paper: "#ffffff"
  slate-line: "#e2e8f0"
  muted-ink: "#64748b"
  dark-card: "#0f172a"
  dark-border: "#1e293b"
  dark-muted: "#94a3b8"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  2xl: "14px"
  3xl: "18px"
  4xl: "24px"
spacing:
  "2.5": "10px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
components:
  button-primary:
    backgroundColor: "{colors.broadcast-red}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    height: "2.5rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
---

# Design System: LiveTVFree

## Overview

**Creative North Star: "Broadcast Control"**

LiveTVFree is a modern live-TV dispatch surface: quick status scanning, signal clarity, and an instrument-panel feel elevated into something slick, legible, and beautiful. The visitor opens the app to find a channel worth watching across sports, news, and entertainment, and their job is to locate a stream that actually plays without wasting time on dead links. The visual system treats every screen like a broadcast control surface — clean enough to scan many channels at once, with enough breathing room that a single "working" signal jumps out.

Personality is confident and utilitarian with a signal-first accent: near-ink text on a clean slate field, crisp borders, and Broadcast Red reserved for interactivity, selection, and status. Dark mode inverts to a deep space field with card surfaces, keeping the same red accent so the instrument panel reads identically in both themes. Motion is minimal and purposeful (status-dot pulses, soft hover lifts, one authored entrance per viewport), never decorative.

**Key Characteristics:**
- Broadcast control density: many channels scannable at once, one playable signal easy to spot.
- Broadcast Red (#ef4444) as the single saturated accent for buttons, focus rings, selection, and status.
- Flat-by-default surfaces; depth comes from borders, background layering, and tonal shifts between light and dark modes. Shadows appear only as a response to state.
- Dark mode as a first-class theme with genuine surface differentiation — cards sit clearly on the background in both modes.
- Non-sticky header that acts as a broadcast station identifier: logo left, source and theme actions right.
- Persuade-mode opening: the homepage leads with the value proposition, then the dashboard.

## Mode

**Persuade.** The homepage opening must make the offer intelligible and desirable, expose a clear action, and demonstrate something only this product can prove: browser-based stream health probing. The visitor should understand what LiveTVFree is, why it matters, and what to do within seconds.

## Colors

One accent (Broadcast Red) carried across light and dark modes, supported by a slate/ink neutral field. The red is the brand's energy and its functional signal: it means "interactive here" and "this stream plays."

### Primary
- **Broadcast Red** (#ef4444): The brand accent and functional signal. Used on primary buttons, focus rings, selected-channel borders, destructive states, and chart-1. Per the **One Voice Rule**, it is the only saturated color on any given screen.

### Neutral (Light)
- **Slate-50** (#f8fafc): Light-mode background and neutral field; the default canvas.
- **Ink** (#0f172a): Near-black foreground and text; used for body, headings, card/popover text.
- **Paper** (#ffffff): Card and popover surfaces in light mode.
- **Slate Line** (#e2e8f0): Borders and input fields in light mode.
- **Muted Ink** (#64748b): Secondary and caption text in light mode.

### Neutral (Dark)
- **Slate-950** (#020617): Dark-mode background and neutral field; deep space canvas.
- **Foreground** (#f8fafc): Near-white foreground and text in dark mode.
- **Card** (#0f172a): Card and popover surfaces in dark mode — clearly darker than muted, lighter than background.
- **Dark Border** (#1e293b): Borders and input fields in dark mode.
- **Dark Muted** (#94a3b8): Secondary and caption text in dark mode.

**The One Voice Rule.** Broadcast Red is the sole saturated accent on any given screen. Its rarity is the point: if everything shouts, no signal lands. Use it for buttons, rings, selection, and status — never for decoration.

## Typography

**Display Font:** Inter (with system-ui and sans-serif fallbacks)
**Body Font:** Inter (with system-ui and sans-serif fallbacks)
**Label/Mono Font:** Geist Mono (with ui-monospace and monospace fallbacks)

**Character:** A utilitarian sans pairing. Inter carries interface text at small sizes where legibility matters most; Geist Mono appears for code-ish data such as playlist sources and technical labels.

### Hierarchy
- **Display** (3rem / 48px, 800, tracking-tight): Page-level headlines on the homepage opening.
- **Heading** (1.875rem / 30px, 700): Section titles such as "Channels."
- **Title** (1.25rem / 20px, 600): Card titles, channel names in prominent contexts.
- **Body** (1rem / 16px, 400, leading-1.6): Descriptive text, channel descriptions. Max comfortable line length ~65–75ch.
- **Label** (0.875rem / 14px, 500): Channel groups, status labels, captions. Uppercase is not used; letter-spacing is normal.
- **Caption** (0.75rem / 12px, 500, tracking-wider): Fine print, meta information.

**The Small-Text Rule.** Captions and group labels sit at 0.75rem / text-xs with 500 weight — small but never light. If it's hard to read at a glance, it's too small or too thin.

**Body measure** 65–75ch where blocks of text appear. **Display max** 6rem. **Tracking floor** -0.04em.

## Layout

The shell is a centered, max-width container (`max-w-7xl`, `mx-auto`, `px-4 sm:px-6 lg:px-8`) sitting on a full-viewport-height main (`min-h-dvh`). A non-sticky header (`h-16`, `border-b`, subtle blur) holds the logo, source control link, and theme toggle. The header scrolls with the page — it is not fixed.

The homepage opens with a Persuade section: kicker, headline, and supporting copy that states the value proposition before the dashboard.

The dashboard uses a named-area CSS grid (`dashboard-grid`) with a 1.5rem gap. On mobile the rail sits at the top of the scroll and the list scrolls below; at 1024px and wider the player (8 cols) and channel list (4 cols) sit side by side. Responsive behavior is desktop-first for the grid split and mobile-first for the rail's sticky placement.

Spacing rhythm: 10px (`2.5`) for dense component padding, 12px (`3`) / 16px (`4`) / 20px (`5`) / 24px (`6`) / 32px (`8`) / 40px (`10`) for section and component gaps. More space above a heading than below it.

## Elevation & Depth

Flat by default. Surfaces carry no shadow at rest; depth is conveyed through borders, background layering (paper cards on slate field), and tonal shifts between light and dark modes. Shadows appear only as a response to state — a selected channel lifts with a subtle red-tinted ring, buttons carry a soft shadow on hover, and glass panels use diffused shadow in light mode. The panel never relies on drop shadows for legibility; color and border do that work.

### Shadow Vocabulary
- **State lift** (diffused, light only): Glass panels and hovered surfaces — temporary elevation on interaction.
- **Selection lift** (red-tinted ring): Selected channel list item — confirms the active choice with color-tinted depth.
- **Hover shadow** (soft): Interactive surfaces lift slightly on hover.

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, elevation, focus, selection). Never use shadow to separate content that color and border can separate.

## Shapes

Corners are gently curved, never sharp and never pill-shaped. The base radius is 12px (`--radius`, exposed as `{rounded.xl}`), stepped down for dense elements (6px sm, 8px md) and up for emphasis (14px 2xl, 18px 3xl, 24px 4xl). Channel list items and buttons use `rounded-xl` (12px); the theme toggle and channel monogram avatar use `rounded-xl` / `rounded-md` (12px / 8px); status dots are `rounded-full`. Borders are thin (1px) on `slate-line`; the header uses a softened `border-border/80`. Clipping is minimal — object-contain for channel logos, no aggressive masking.

## Components

### Buttons
- **Shape:** Rounded-xl (12px), `inline-flex`, text-sm font-medium, whitespace-nowrap by default.
- **Primary:** `bg-broadcast-red text-white` on rest, `hover:bg-primary/90`, 2.5rem height, 12px horizontal padding. Focus ring is `ring-ring/50` (red at 50% opacity); active translates 1px down.
- **Hover / Focus:** Primary darkens to 90% opacity on hover; focus-visible shows a 3px red ring at 50% opacity. Disabled is 50% opacity with no pointer events.
- **Secondary / Ghost / Destructive / Link:** Ghost is transparent background with ink text and muted hover; outline sits on background with a border; destructive uses red at 10% background tinting to 20% on hover; link is primary-colored with an underline on hover.

### Cards / Containers (channel list item)
- **Corner Style:** Rounded-xl (12px).
- **Background:** `bg-card` at rest, `bg-red-500/10` when selected.
- **Shadow Strategy:** Flat at rest; subtle red-tinted ring when selected.
- **Border:** 1px `border-border` at rest, `border-red-500/50` when selected; dark mode shifts to `border-slate-700` on hover.
- **Internal Padding:** 12px (`p-3`) — scannable rows with breathing room.
- **Distinctive behavior:** Each row is a button-sized touch target (`cursor-pointer`, `aria-pressed`), with a leading avatar (channel logo or two-letter monogram in a muted or red pill), trailing status dot (working emerald-500 / failed rose-500 / testing amber-400 pulse / untested muted), and truncating two-line text (name bold foreground, group muted 10px).

### Status Indicator (signature element)
- **Style:** 10px (`w-2.5 h-2.5`) `rounded-full` dot, shrink-0.
- **State:** working = `bg-emerald-500`; failed = `bg-rose-500`; testing = `animate-pulse bg-amber-400`; untested = `bg-muted-foreground/30`.

### Navigation (Header)
- **Style:** Header bar, `h-16` (64px), `bg-background/80 backdrop-blur-sm`, `border-b border-border`. Container `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`, flex row with logo left, actions right. **Non-sticky** — scrolls with the page.
- **Typography:** Icon buttons at `w-4 h-4`; theme toggle is `ghost` variant `size-icon-sm`, `rounded-xl p-2`, `shadow-sm`, `text-muted-foreground` with `hover:text-foreground`.
- **Default / hover / active:** Action links use `text-muted-foreground` lifting to `text-foreground` on hover with border shift; dark mode sharpens the hover border.
- **Mobile treatment:** Header height and padding scale (`px-4` → `sm:px-6` → `lg:px-8`); no separate mobile nav — actions collapse into the same row.

### Player Grid Background (signature element)
- **Style:** 32px repeating grid pattern (thin white or black lines at 3–4% opacity) over a dark (`#0c0e15`) or mist (`#f8fafc`) field, theme-dependent. Used behind the video player area to evoke a broadcast monitor.

### Glass Panel
- **Style:** `backdrop-blur-16`, semi-transparent background (`rgba(17,20,29,0.85)` dark / `rgba(255,255,255,0.92)` light), 1px hairline border, light-mode soft shadow, dark-mode subtle shadow.
- **Use:** Overlay surfaces that sit atop content without fully obscuring it.

### Entrance Motion
- **Style:** One authored moment per viewport — `slideIn` (450ms, cubic-bezier(0.16, 1, 0.3, 1)) translating up 12px from opacity 0. Applied to the first viewport's main content block. Respects `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** use Broadcast Red (#ef4444) as the only saturated accent; keep it rare so the signal lands (One Voice Rule).
- **Do** keep surfaces flat at rest; add shadow/lift only on hover, selection, or focus (Flat-By-Default Rule).
- **Do** render status dots at exactly 10px with the working/failed/testing/untested color mapping; never reuse those colors for non-status elements.
- **Do** keep channel rows at 12px padding with truncating two-line text so many channels stay scannable.
- **Do** use the typography scale (Display / Heading / Title / Body / Label / Caption) consistently; more space above a heading than below it.
- **Do** make dark mode a genuine inversion with surface differentiation — cards clearly darker than muted, background clearly darkest.

### Don't:
- **Don't** introduce a second saturated hue (blue, green, purple) as a brand accent; emerald/rose/amber exist only for status dots.
- **Don't** set a centralized heading scale in globals.css and then ignore it — if you add one, apply it consistently across Display / Headline / Title.
- **Don't** drop shadows beneath unselected cards to fake depth; use border and background layering instead.
- **Don't** make the header sticky — it scrolls with the page as a non-fixed broadcast identifier.
- **Don't** use gradient text, glass as decoration, or hard offset shadows outside the committed world.

## Browser Surfaces (theme them all)

Text selection, caret, custom scrollbars, focus rings, underline offset, and tabular numerals all ship from the palette. The scrollbar thumb uses `muted-foreground` tinted toward the theme's ground, hovering to Broadcast Red. Focus rings are `ring-ring/50` (Broadcast Red at 50% opacity). Text selection uses Broadcast Red mixed toward white (light) or black (dark).
