---
name: LiveTVFree
description: "Watch live TV channels from public playlists — sports, news, entertainment and more. Browse working channels, test streams in your browser, and find the ones that play."
colors:
  broadcast-red: "#ef4444"
  slate-mist: "#f1f5f9"
  ink: "#090b0e"
  paper: "#ffffff"
  slate-line: "#e2e8f0"
  muted-ink: "#64748b"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 500
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  3xl: "22px"
  4xl: "26px"
spacing:
  "2.5": "10px"
  4: "16px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.broadcast-red}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    height: "2rem"
  button-primary-hover:
    backgroundColor: "{colors.broadcast-red}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
---

# Design System: LiveTVFree

## Overview

**Creative North Star: "The Control Room"**

LiveTVFree is a dispatch-style dashboard for live TV: quick status scanning, signal clarity, and an instrument-panel feel. The visitor opens the app to find a channel worth watching across sports, news, and entertainment, and their job is to locate a stream that actually plays without wasting time on dead links. The visual system treats every screen like a control surface — dense enough to scan many channels at once, but with enough breathing room that a single "working" signal jumps out.

Personality is deliberate and utilitarian with a confident accent: near-black text on a misty slate field, crisp borders, and Broadcast Red reserved for interactivity and status. Dark mode inverts to a deep charcoal field with paper surfaces, keeping the same red accent so the instrument panel reads identically in both themes. Motion is minimal and purposeful (status-dot pulses, soft hover lifts), never decorative.

**Key Characteristics:**
- Dispatch dashboard density: many channels scannable at once, one playable signal easy to spot.
- Broadcast Red as the single accent for buttons, focus rings, selection, and status.
- Flat-by-default surfaces; shadows and lifts appear only as a response to state (hover, selection, focus).
- Dark mode as a first-class theme, not an afterthought; red accent holds constant across both.
- Responsive shell: sticky rail on phones, rail-plus-sidebar on desktop.

## Colors

One accent (Broadcast Red) carried across light and dark modes, supported by a slate/ink neutral field. The red is the brand's energy and its functional signal: it means "interactive here" and "this stream plays."

### Primary
- **Broadcast Red** (#ef4444): The brand accent and functional signal. Used on primary buttons, focus rings, selected-channel borders, destructive states, and chart-1. Per the **One Voice Rule**, it is the only saturated color on any given screen.

### Neutral
- **Slate Mist** (#f1f5f9): Light-mode background and neutral field; also secondary, muted, and accent surfaces in light mode. The default canvas.
- **Ink** (#090b0e): Near-black foreground and text; used for body, headings, card/popover text, and secondary/accent foregrounds.
- **Paper** (#ffffff): Card and popover surfaces in light mode.
- **Slate Line** (#e2e8f0): Borders and input fields in light mode.
- **Muted Ink** (#64748b): Secondary and caption text in light mode.

**The One Voice Rule.** Broadcast Red is the sole saturated accent on any given screen. Its rarity is the point: if everything shouts, no signal lands. Use it for buttons, rings, selection, and status — never for decoration.

## Typography

**Display Font:** Inter (with system-ui and sans-serif fallbacks)
**Body Font:** Inter (with system-ui and sans-serif fallbacks)
**Label/Mono Font:** Geist Mono (with ui-monospace and monospace fallbacks)

**Character:** A utilitarian sans pairing. Inter carries interface text at small sizes where legibility matters most; Geist Mono appears for code-ish data such as playlist sources and technical labels.

### Hierarchy
- **Display:** Not codified in globals.css; set per-component. Headings appear at component level without a centralized scale — treat as an opportunity to establish one.
- **Headline:** Not codified in globals.css; set per-component.
- **Title:** Not codified in globals.css; set per-component.
- **Body** (400, default size, leading-none): Channel names, descriptive text. Max comfortable line length ~65–75ch where blocks of text appear.
- **Label** (500, 0.8rem): Channel groups, status labels, captions. Uppercase is not used; letter-spacing is normal.

**The Small-Text Rule.** Captions and group labels sit at 0.8rem / text-xs with 500 weight — small but never light. If it's hard to read at a glance, it's too small or too thin.

## Layout

The shell is a centered, max-width container (`max-w-7xl`, `mx-auto`, `px-4 sm:px-6 lg:px-8`) sitting on a full-viewport-height main (`min-h-dvh`). A sticky header (`h-14`, `backdrop-blur-md`, `border-b`) holds the logo, source control link, and theme toggle.

The dashboard uses a named-area CSS grid (`dashboard-grid`) with a 1.5rem gap. On mobile the rail sits at the top of the scroll and the list scrolls below; at 1024px and wider the rail and an aside column sit beside the main content. Responsive behavior is desktop-first for the grid split and mobile-first for the rail's sticky placement.

Spacing rhythm is drawn from observed values rather than a centralized scale: 10px (`2.5`) for dense component padding, 16px (`4`) / 24px (`6`) / 32px (`8`) for header padding breakpoints, 56px (`14`) header height, and a 24px dashboard gap.

## Elevation & Depth

Flat by default. Surfaces carry no shadow at rest; depth is conveyed through borders, background layering (paper cards on mist background), and tonal shifts between light and dark modes. Shadows appear only as a response to state — a selected channel lifts with `shadow-md shadow-red-500/10`, buttons carry a soft `shadow-sm`, and the glass panel uses a diffused `0 4px 20px -2px rgba(0,0,0,0.05)` in light mode. The panel never relies on drop shadows for legibility; color and border do that work.

### Shadow Vocabulary (if applicable)
- **State lift** (`0 4px 20px -2px rgba(0,0,0,0.05)` in light; diffused in dark): Glass panels and hovered surfaces — temporary elevation on interaction.
- **Selection lift** (`shadow-md shadow-red-500/10`): Selected channel list item — confirms the active choice with color-tinted depth.

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, elevation, focus, selection). Never use shadow to separate content that color and border can separate.

## Shapes

Corners are gently curved, never sharp and never pill-shaped. The base radius is 10px (`--radius`, exposed as `{rounded.lg}`), stepped down for dense elements (6px sm, 8px md) and up for emphasis (14px xl, 18px 2xl, 22px 3xl, 26px 4xl). Channel list items and buttons use `rounded-lg` (10px); the theme toggle and channel monogram avatar use `rounded-xl` / `rounded-md` (14px / 8px); status dots are `rounded-full`. Borders are thin (1px) on `slate-line`; the header uses a softened `border-border/80`. Clipping is minimal — object-contain for channel logos, no aggressive masking.

## Components

### Buttons
- **Shape:** Rounded-lg (10px), `inline-flex`, text-sm font-medium, whitespace-nowrap by default.
- **Primary:** `bg-broadcast-red text-white` on rest, `hover:bg-primary/80`, 2rem height, 10px horizontal padding. Focus ring is `ring-ring/50` (red at 50% opacity); active translates 1px down.
- **Hover / Focus:** Primary darkens to 80% opacity on hover; focus-visible shows a 3px red ring at 50% opacity. Disabled is 50% opacity with no pointer events.
- **Secondary / Ghost / Destructive / Link:** Ghost is transparent background with ink text and muted hover; outline sits on background with a border; destructive uses red at 10% background tinting to 20% on hover; link is primary-colored with an underline on hover.

### Cards / Containers (channel list item)
- **Corner Style:** rounded-lg (10px).
- **Background:** `bg-card/80` (paper at 80% opacity) at rest, `bg-red-500/10` when selected.
- **Shadow Strategy:** Flat at rest; `shadow-md shadow-red-500/10` when selected (see Elevation).
- **Border:** 1px `border-border` at rest, `border-red-500` when selected; dark mode shifts to `border-slate-700` on hover.
- **Internal Padding:** 10px (`p-2.5`) — dense, scannable rows.
- **Distinctive behavior:** Each row is a button-sized touch target (`cursor-pointer`, `aria-pressed`), with a leading avatar (channel logo or two-letter monogram in a muted or red pill), trailing status dot (working emerald-500 / failed rose-500 / testing amber-400 pulse / untested muted), and truncating two-line text (name bold foreground, group muted 9px).

### Status Indicator (signature element)
- **Style:** 8px (`w-2 h-2`) `rounded-full` dot, shrink-0.
- **State:** working = `bg-emerald-500`; failed = `bg-rose-500`; testing = `animate-pulse bg-amber-400`; untested = `bg-muted-foreground/30`.

### Navigation
- **Style:** Header bar, `h-14` (56px), `bg-background/95 backdrop-blur-md`, `border-b border-border/80`. Container `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`, flex row with logo left, actions right.
- **Typography:** Icon buttons at `w-4 h-4`; theme toggle is `ghost` variant `size-icon-sm`, `rounded-xl p-2`, `shadow-sm`, `text-muted-foreground` with `hover:text-foreground`.
- **Default / hover / active:** Action links use `text-muted-foreground` lifting to `text-foreground` on hover with border shift; dark mode sharpens the hover border.
- **Mobile treatment:** Header height and padding scale (`px-4` → `sm:px-6` → `lg:px-8`); no separate mobile nav — actions collapse into the same row.

### Player Grid Background (signature element)
- **Style:** 32px repeating grid pattern (thin white or black lines at 3–4% opacity) over a dark (`#0c0e15`) or mist (`#f1f5f9`) field, theme-dependent. Used behind the video player area to evoke a broadcast monitor.

### Glass Panel
- **Style:** `backdrop-blur-12`, semi-transparent background (`rgba(17,20,29,0.85)` dark / `rgba(255,255,255,0.90)` light), 1px hairline border, light-mode `shadow-sm`.
- **Use:** Overlay surfaces that sit atop content without fully obscuring it.

## Do's and Don'ts

### Do:
- **Do** use Broadcast Red (#ef4444) as the only saturated accent; keep it rare so the signal lands (One Voice Rule).
- **Do** keep surfaces flat at rest; add shadow/lift only on hover, selection, or focus (Flat-By-Default Rule).
- **Do** render status dots at exactly 8px with the working/failed/testing/untested color mapping; never reuse those colors for non-status elements.
- **Do** keep channel rows at 10px padding with truncating two-line text so many channels stay scannable.

### Don't:
- **Don't** introduce a second saturated hue (blue, green, purple) as a brand accent; emerald/rose/amber exist only for status dots.
- **Don't** set a centralized heading scale in globals.css and then ignore it — if you add one, apply it consistently across Display / Headline / Title.
- **Don't** drop shadows beneath unselected cards to fake depth; use border and background layering instead.
- **Don't** make channel rows taller than the 10px-padded baseline unless a new information tier is justified.
