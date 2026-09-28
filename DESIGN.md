---
version: 1
name: Motion Dance
description: Bright, bouncy, kid-safe dance game UI over a full-bleed 3D stage. Candy colours on a daylight violet studio, one soft card, pill buttons and chips, and a hint banner that stays readable from 2 metres.
colors:
  grape: "#8140d0"
  grape-deep: "#6a2fbf"
  ink: "#2b1d4f"
  ink-soft: "#5c5378"
  cloud: "#ffffff"
  lilac: "#f4eeff"
  lavender: "#c9b6ff"
  bubblegum: "#ff6fb1"
  sky: "#4cbcff"
  mint: "#46dd9b"
  sunshine: "#ffd23f"
  tangerine: "#ff9a4a"
  sunshine-soft: "#ffe3a3"
  tangerine-soft: "#ffd0ad"
  scrim: "rgba(106, 47, 191, 0.28)"
  glass: "rgba(255, 255, 255, 0.72)"
typography:
  family: "'Nunito', system-ui, sans-serif"
  weights: [600, 800, 900]
  italic: [900]
  logo: { size: "clamp(48px, 9vw, 96px)", weight: 900, style: italic, line-height: 0.95 }
  count: { size: "clamp(120px, 24vw, 240px)", weight: 900, style: italic, line-height: 1 }
  big-score: { size: "clamp(64px, 11vw, 112px)", weight: 900, line-height: 1 }
  verdict: { size: "clamp(36px, 6vw, 80px)", weight: 900, style: italic, line-height: 1 }
  h2: { size: "clamp(26px, 3.2vw, 36px)", weight: 900, line-height: 1.1 }
  hint: { size: "clamp(20px, 2.2vw, 30px)", weight: 800, line-height: 1.2 }
  lead: { size: "clamp(17px, 1.8vw, 20px)", weight: 600, line-height: 1.45 }
  body: { size: 16px, weight: 600, line-height: 1.45 }
  h3: { size: 14px, weight: 900, line-height: 1.2, transform: uppercase, tracking: 0.06em }
  chip: { size: 13px, weight: 900, line-height: 1, transform: uppercase, tracking: 0.08em }
  small: { size: 13px, weight: 600, line-height: 1.4 }
rounded:
  sm: 12px
  md: 20px
  lg: 28px
  pill: 999px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 24px
  6: 32px
  7: 48px
  edge: "clamp(12px, 3vw, 28px)"
elevation:
  float: "0 6px 18px rgba(58, 30, 120, 0.18)"
  card: "0 16px 40px rgba(58, 30, 120, 0.24)"
  press: "0 3px 0 rgba(58, 30, 120, 0.25)"
motion:
  pop: "cubic-bezier(0.2, 1.4, 0.4, 1)"
  out: "cubic-bezier(0.2, 0.8, 0.2, 1)"
  fast: 150ms
  base: 250ms
  slow: 450ms
components:
  card: { background: cloud, color: ink, radius: lg, shadow: card, padding: "clamp(20px, 4vw, 36px)" }
  cta: { background: grape, color: cloud, radius: pill, padding: "18px 32px", font: "900 20px", shadow: press }
  chip: { background: lilac, color: grape-deep, radius: pill, padding: "6px 12px" }
  chip-record: { background: sunshine, color: ink }
  score-chip: { background: glass, color: ink, radius: pill, shadow: float }
  banner: { background: cloud, color: ink, radius: md, shadow: card, max-width: 760px }
  verdict: { color: ink, radius: pill, rotate: -3deg }
  pip: { background: ink, radius: md, border: "3px solid cloud", shadow: float }
  pictos: { background: glass, radius: lg, shadow: float }
---

# Motion Dance design system

Read [PRODUCT.md](PRODUCT.md) first: it says who plays, from how far away, and what the screen must never do. This file turns that into colours, type, shapes, components and layout. The tokens in the front matter map one-to-one to CSS custom properties on `:root` in `src/style.css` (`--grape`, `--ink`, `--r-lg`, `--s-4`, `--shadow-card`, `--ease-pop` and so on).

## Overview

A sunny dance studio, not a nightclub. The 3D stage is a bright violet-to-pink room with candy-coloured floor tiles, and the coach dances in the middle of it. Everything the game draws on top is either a **white card** (screens between songs) or a **small floating piece** at the edge of the screen (during the song). Pieces are soft: rounded, lightly shadowed, never outlined in black.

The feel comes from three things working together:

- **Colour** does the delight: five candy hues for pictograms, ratings and confetti, always on white or glass so they stay clean.
- **Nunito** does the friendliness: round terminals, heavy weights, a 900 italic for the loud moments (logo, rating word, countdown).
- **Motion** does the bounce: things pop in with a slight overshoot and leave quickly.

What it replaces: the chunky mobile-game look (white-rimmed blue gradient panels, `-webkit-text-stroke` outlines, hard black drop shadows) and the near-black neon stage. Neither survives in the new system.

## Colors

### Roles

| Token | Hex | Role |
|---|---|---|
| `grape` | `#8140d0` | Brand. Primary button, focus ring, calibration/system banners, `theme-color`. |
| `grape-deep` | `#6a2fbf` | Pressed button, chip text, brand text on white, headings on lilac. |
| `ink` | `#2b1d4f` | All body text on light surfaces. A deep violet, never pure black. |
| `ink-soft` | `#5c5378` | Secondary text: fine print, captions, dates in the leaderboard. |
| `cloud` | `#ffffff` | Cards, banner, pictogram halos. |
| `lilac` | `#f4eeff` | Quiet fills inside cards: chips, stat tiles, leaderboard rows, empty bar tracks. |
| `lavender` | `#c9b6ff` | Stage wash, empty star, decorative dots. Not for text backgrounds that need emphasis. |

### Candy

The five candy hues are the game's voice. `PICTO_COLORS` in `src/ui/hud.ts` already cycles through them in this order, so neighbouring pictograms never share a colour.

| Token | Hex | Used for |
|---|---|---|
| `bubblegum` | `#ff6fb1` | Pictograms, confetti, logo accent, stage rim light (left). |
| `sky` | `#4cbcff` | Pictograms, «Неплохо» rating, stage rim light (right). |
| `mint` | `#46dd9b` | Pictograms, «Хорошо» rating, success banner, matched arm in the camera window. |
| `sunshine` | `#ffd23f` | Pictograms, «Идеально!» rating, stars, new record, "fix" banner accent. |
| `tangerine` | `#ff9a4a` | Pictograms, «Мимо» rating, "miss" and "frame" banner accent, off-target arm in the camera window. |

`sunshine-soft` (`#ffe3a3`) and `tangerine-soft` (`#ffd0ad`) are tints for large surfaces that need the hue without the glare: the progress track of a fix banner, the warm-up card when a pose was skipped.

### Rules

- **Text on a candy colour is always `ink`.** Every candy/ink pair passes AA (lowest: `ink` on `bubblegum`, 5.9:1). White on candy fails and is not allowed.
- **White text only on `grape`, `grape-deep` or `ink`** (5.9:1, 7.6:1, 15:1).
- **No red anywhere.** A miss is `tangerine`, which reads as "warm, try again" rather than "wrong". This includes the camera skeleton, which today uses `#ff4d5e`.
- **Colour never carries meaning alone.** A rating is always a word; a hint always names the body part; a skeleton arm's colour is backed by the banner text.
- Tinted shadows: shadows use `rgba(58, 30, 120, a)`, a dark grape, never black.

### Contrast (checked)

| Pair | Ratio |
|---|---|
| `ink` on `cloud` | 15.1 |
| `ink` on `lilac` | 13.3 |
| `ink` on `sunshine` | 10.5 |
| `ink` on `mint` | 8.7 |
| `ink` on `lavender` | 8.4 |
| `ink` on `tangerine` | 7.2 |
| `ink` on `sky` | 7.2 |
| `ink` on `bubblegum` | 5.9 |
| `cloud` on `grape-deep` | 7.6 |
| `ink-soft` on `cloud` | 7.1 |
| `ink-soft` on `lilac` | 6.3 |
| `cloud` on `grape` | 5.9 |

### Stage palette

The 3D stage (`src/stage/stage.ts`, `textures.ts`) and the 2D fallback (`flatStage.ts`) move from night to day:

| Element | Now | Target |
|---|---|---|
| Scene background | `#1a0f5c` | `#b9a2ff` |
| Backdrop gradient | `#ff2fb3 → #8a2cff → #1a0f5c` | `#ffc2e0 → #c9b6ff → #9d7cf0` (top to bottom) |
| Hemisphere light | sky `#ffe6ff`, ground `#3a2a80` | sky `#fff4fb`, ground `#9d7cf0`, intensity up |
| Floor tiles | full-saturation neon | the five candy hues, `toneMapped` on so they read as painted, not glowing |
| Rim lights | `#ff2fb3`, `#22d3ee` | `bubblegum`, `sky`, lower intensity |
| Light beams | additive, opacity 0.35 | additive, opacity 0.18, or off on phones |
| Confetti | random floor colour | random candy colour |

The coach keeps the film-like key light and soft shadow; the room around them gets brighter.

## Typography

One family: **Nunito**, already loaded in `index.html` at 600, 800, 900 and 900 italic, with Cyrillic. `system-ui` is the fallback. No other fonts.

| Style | Size | Weight | Where |
|---|---|---|---|
| `logo` | `clamp(48px, 9vw, 96px)` | 900 italic | «Motion Dance» on the intro. «Dance» in `grape`, «Motion» in `ink`. |
| `count` | `clamp(120px, 24vw, 240px)` | 900 italic | Countdown numeral, `grape` with a `cloud` glow shadow. |
| `big-score` | `clamp(64px, 11vw, 112px)` | 900 | Final score, `ink`, `tabular-nums`. |
| `verdict` | `clamp(36px, 6vw, 80px)` | 900 italic | Rating word after each move. ≥ 48 px from 800 px wide. |
| `h2` | `clamp(26px, 3.2vw, 36px)` | 900 | Card titles. |
| `hint` | `clamp(20px, 2.2vw, 30px)` | 800 | Hint banner text. ≥ 26 px from 1200 px wide. |
| `lead` | `clamp(17px, 1.8vw, 20px)` | 600 | Intro paragraph. |
| `body` | 16 px | 600 | Card text, stat labels. |
| `h3` | 14 px | 900 caps, 0.06em | Section labels inside the results card, `grape-deep`. |
| `chip` | 13 px | 900 caps, 0.08em | Chips, banner label, score label. |
| `small` | 13 px | 600 | Fine print, credit, leaderboard dates, `ink-soft`. |

Rules:

- Weight 600 is the lightest weight on screen: 400 looks thin from 2 m.
- Italic 900 is reserved for the four loud moments: logo, verdict, countdown, «Новый рекорд!». Nowhere else.
- All numbers that change (score, combo, percentages, countdown) use `font-variant-numeric: tabular-nums` so they don't jitter.
- No text outlines (`-webkit-text-stroke`) and no hard text shadows. Text sitting directly on the stage (countdown, verdict) is legible because it sits on a sticker or has a soft `cloud` glow: `0 2px 0 #fff, 0 0 24px rgba(255,255,255,0.8)`.
- Line length in cards: `max-width: 60ch` for paragraphs.

## Layout

### Z-order

| Layer | z-index | Contents |
|---|---|---|
| Stage | 0 | `#scene` canvas, the coach. |
| Effects | 3 | Flash, floating "+points". |
| HUD | 4 | Score chip, star gauge, pictogram lane. |
| Feedback | 5 | Verdict sticker, hint banner. |
| Screens | 6 | Intro, loading, calibration, warm-up, countdown, results. |
| Camera | 7 | Camera window. It stays above the results card so the player can watch themselves raise a hand to restart. |

### During the song

The coach stands in the centre third. The UI lives in the four corners and the bottom strip, inset by `edge` (`clamp(12px, 3vw, 28px)`) plus `env(safe-area-inset-*)`.

```
┌──────────────────────────────────────────────┐
│ [Очки 1240 · Комбо ×6]            ┌────────┐ │
│ ★ gauge                           │ camera │ │
│ ┃                                 └────────┘ │
│ ┃            ИДЕАЛЬНО!                       │
│ ┃                                            │
│ ┃              (coach)                       │
│ ┃                         ┌────────────────┐ │
│                           │ ◯ ♀ ♀ ♀ ♀      │ │  pictogram lane
│                           └────────────────┘ │
│   ┌──────────────────────────────────────┐   │
│   │ ПОЧТИ  Левая рука: подними выше на 45° │   │  hint banner
│   └──────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

- **Top left:** score chip; the star gauge hangs below it as a vertical bar.
- **Top right:** camera window.
- **Top centre, ~14vh:** verdict sticker, above the coach's head.
- **Right, above the banner:** pictogram lane, with its bottom edge at least `space-4` above the banner's top edge.
- **Bottom centre:** hint banner.

The banner and the lane never overlap: the lane is positioned from the banner's top (`bottom: calc(edge + banner-height + space-4)`), and the banner reserves its height even while hidden so the lane doesn't jump.

### Between songs

- **Intro and results:** one centred `card`, `max-width` 900 px (intro) / 840 px (results), over a `scrim` so the stage stays visible but quiet. The card scrolls internally if the viewport is short; the page never scrolls.
- **Calibration and warm-up:** a `card` of 380 px on the left, vertically centred, so the coach demonstrating the pose stays visible on the right.
- **Countdown:** no card. The numeral and song name sit centred on the stage.
- **Loading and error:** a compact centred card.

### Phones (≤ 720 px)

- HUD shrinks to the score chip only; the gauge becomes a thin horizontal bar under it.
- Camera window: 112 px wide, no label.
- Pictogram lane: full width between the edges, 84 px tall, directly above the banner.
- Warm-up and calibration cards move to the bottom, above the banner, and drop the paragraph.
- Hint text floor: 20 px. Verdict floor: 36 px.

### Spacing

A 4 px base: `4, 8, 12, 16, 24, 32, 48`. Inside a card, groups are separated by `space-5` (24), items within a group by `space-2`/`space-3`. Card padding is `clamp(20px, 4vw, 36px)`.

## Elevation & Depth

Three soft levels, all tinted grape, no outlines:

| Token | Value | Used by |
|---|---|---|
| `float` | `0 6px 18px rgba(58,30,120,0.18)` | HUD pieces, camera window, pictogram lane, chips on the stage. |
| `card` | `0 16px 40px rgba(58,30,120,0.24)` | Screen cards, hint banner. |
| `press` | `0 3px 0 rgba(58,30,120,0.25)` | Under the primary button, collapsing to 0 on press. |

Pieces floating over the stage get a 2–3 px `cloud` border to separate them from busy floor tiles. Cards on a scrim don't need one.

Glass (`rgba(255,255,255,0.72)`) is a flat fill, no `backdrop-filter`: blur is too expensive next to pose recognition and WebGL.

## Shapes

| Token | Value | Used by |
|---|---|---|
| `sm` | 12 px | Leaderboard rows, stat tiles, progress bars' ends. |
| `md` | 20 px | Hint banner, camera window, gesture cards, pictogram tiles. |
| `lg` | 28 px | Screen cards, pictogram lane. |
| `pill` | 999 px | Buttons, chips, score chip, verdict sticker, bars. |

Everything is rounded; there are no sharp corners in the UI. Circles are used for exactly three things: the calibration ring, the warm-up pictogram medallion and the "now" marker in the pictogram lane.

## Components

### Card (`.panel`, `.intro-card`, `.over-card`)

White, `radius-lg`, `shadow-card`, `ink` text. One card at a time. State variants for the warm-up change only a 6 px top stripe and the chip, never the whole card colour:

- default: `grape` stripe
- `panel-done`: `mint` stripe, chip «Отлично!»
- `panel-skipped`: `tangerine-soft` card fill, `tangerine` stripe

Enters with `pop` over `base`; leaves with a `fast` fade.

### Primary button (`.cta`)

The only button style. Pill, `grape` fill, `cloud` text, 900 20 px, sentence case (no uppercase: Cyrillic caps get long). Padding `18px 32px`, minimum height 56 px.

- hover: `grape` lightened 6%, lift 2 px
- active: `grape-deep`, drop 3 px, shadow gone
- focus-visible: 4 px `sunshine` ring, 4 px offset

There is at most one button per screen. There are no secondary buttons: everything after the first click is a gesture.

### Chip (`.chip`)

Pill, `lilac` fill, `grape-deep` text, `chip` type. Sits at the top-left of a card as its eyebrow: «Калибровка», «Разминка · 2 из 3», «Танец окончен». `.chip-record` is `sunshine` with `ink` text, 900 italic, and gets a single `pop` on entry.

### Score chip and gauge (`.score-chip`, `.gauge`)

- `.score-chip`: glass pill, `float` shadow, 2 px `cloud` border. Label «Очки» in `chip` type (`ink-soft`), score in 900 28 px `ink` tabular. `.combo` sits inside as a nested `sunshine` pill «Комбо ×6»; hidden below ×2; pops each time it increases.
- `.gauge`: a vertical glass track, 14 px wide, 160 px tall, pill ends. `#hud-star-bar` fills bottom to top in a `sunshine → tangerine` gradient to `--p`. Each star in `.gauge-stars` is absolutely positioned at `bottom: calc(var(--at) * 100%)`; empty stars are `lavender`, lit ones `sunshine`. A star with `.new` scales from 1 to 1.4 and back with `pop` over `slow` and releases a small burst of candy confetti on the stage.

### Verdict sticker (`.verdict`)

The rating word after each move, on a pill sticker rotated −3°, `verdict` type, `ink` text, 3 px `cloud` border, `float` shadow.

| `data-rating` | Word | Fill |
|---|---|---|
| `perfect` | Идеально! | `sunshine` |
| `good` | Хорошо | `mint` |
| `ok` | Неплохо | `sky` |
| `miss` | Мимо | `tangerine-soft`, smaller (0.8×), no confetti |

Pops in (scale 0.6 → 1.1 → 1 with `pop`), holds, drifts up 16 px and fades; 900 ms total. A miss never shakes.

### Hint banner (`.banner`)

The error mode's main surface and the most important component in the game.

- White, `radius-md`, `shadow-card`, `max-width: 760px`, `width: calc(100vw - 2 * edge)`.
- Layout: label chip on the left, hint text to its right on one line when it fits, meter underneath.
- `.banner-label`: pill, `chip` type, fill by tone (below), `ink` text.
- `.banner-text`: `hint` type, `ink`. It changes only when the text changes, so it doesn't flicker.
- `.banner-meter`: 10 px pill track in the tone's soft tint, fill in the tone colour, width `--p`. Shown for `fix` and `calib`.
- A 6 px left stripe in the tone colour repeats the label colour at a glance.

| `data-tone` | Label example | Colour |
|---|---|---|
| `good` | Идеально | `mint` |
| `fix` | Почти / Поправь | `sunshine` (track `sunshine-soft`) |
| `miss` | Мимо | `tangerine` |
| `frame` | Поправь кадр | `tangerine` |
| `calib` | Калибровка | `grape` label with `cloud` text, `lavender` track |

Enters by rising 12 px and fading in over `base` with `out`. No shake, no flash, for any tone.

### Pictogram lane (`.pictos`) and pictogram (`.picto`)

- Lane: glass, `radius-lg`, `float` shadow, 2 px `cloud` border, 104 px tall (84 on phones).
- Pictograms scroll right to left and hit the "now" marker on the beat. Each one is the stick figure from `pictogramSvg(move, { outline: true })`: a 10 px white halo under a 5 px stroke in the pictogram's `--picto` colour. The halo is what keeps a sky-blue figure readable over a sky-blue floor tile.
- `.pictos-now`: a 72 px circle on the left with a 4 px dashed `grape` ring.
- `.picto.now`: scale 1.15 and a `cloud` disc behind it, so the current move reads as "this one".

### Camera window (`.pip`)

- `ink` background, `radius-md`, 3 px `cloud` border, `float` shadow. Width `clamp(160px, 22vw, 300px)`.
- `.pip-label` «Так тебя видит камера»: `lilac` pill, `grape-deep` text, bottom-left.
- Drawing (`src/ui/pip.ts`):
  - video at 70% opacity, mirrored
  - skeleton arm on target: `mint`
  - close: `sunshine`
  - off: `tangerine` (replaces `#ff4d5e`)
  - neutral / not judged: `cloud`
  - ghost target: dashed `cloud` line with a 2 px `ink` underlay, so it is distinct from the `sunshine` "close" state and readable on both bright and dark video

### Progress: ring, hold bar, load bar

- Calibration ring: 150 px, 14 px `lavender` track, `grape` fill as a conic gradient to `--p`, percentage in 900 28 px `ink` in the middle on white.
- Hold bar and load bar: 12 px pills, `lilac` track, `grape` fill; the hold bar turns `mint` at 100%.
- Warm-up dots: 28 × 8 px pills, `lavender` when pending, `grape` when done.
- Warm-up medallion (`.tutorial-icon`): 128 px `cloud` circle with `float` shadow; the pictogram inside is `grape`.

### Results

- Big score in `big-score` type, star row above it (44 px stars, `lavender`/`sunshine`), chip above that.
- Rating counts (`.stats li`): `lilac` tiles, `radius-sm`, number in 900 24 px with a 6 px dot in the rating's colour beside the label, so the counts line up with the verdict colours.
- Accuracy bars (`.accuracy`): label, 12 px `lilac` pill track with a `grape` fill, percentage in 900 `tabular-nums`.
- «Что подтянуть» (`.advice`): numbered list, numbers in `grape` 900.
- Leaderboard (`.board`): `lilac` rows, `radius-sm`; the player's row is `sunshine`. Place number in `grape` 900, stars and date in `ink-soft` `small`.
- Restart prompt (`.restart`): a sticky footer strip in `lilac` with `ink-soft` text during the lock countdown; in `.ready` it becomes `grape` with `cloud` text and a raised-hand pictogram, breathing (scale 1 → 1.03) every 1.4 s.

### Loading and error

- Spinner: 56 px, 7 px `lavender` ring with a `grape` arc.
- Error message (`.error-text`): `tangerine-soft` box, `ink` text, `radius-md`, followed by the primary button «Попробовать снова».

## Motion

| Token | Value | Use |
|---|---|---|
| `pop` | `cubic-bezier(0.2, 1.4, 0.4, 1)` | Entrances that should bounce: cards, verdict, stars, combo, countdown. |
| `out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Everything else: banner, fades, bar fills. |
| `fast` | 150 ms | Exits, hover. |
| `base` | 250 ms | Banner, card entrance. |
| `slow` | 450 ms | Star gained, record chip. |

- Animate `transform` and `opacity` only. Bar fills animate `width` inside a fixed-size track, which doesn't trigger layout outside it.
- Nothing shakes. The old `shake` keyframes on the miss banner and `shake-inline` go away.
- Beat-synced motion belongs to the stage (floor pulse, lights). The DOM UI does not pulse to the beat, so the hint stays still enough to read.

### Reduced motion

Under `prefers-reduced-motion: reduce`:

- pops, rises and drifts become a 150 ms opacity fade
- the countdown numeral swaps without scaling
- the restart prompt stops breathing; its colour change carries the "ready" state
- the stage turns off confetti, camera shake and moving beams (pass the media query result into `Stage`)
- the pictogram lane keeps scrolling: its motion is information, not decoration

## Iconography

- **Pictograms** are the only illustration style: the stick figure from `src/ui/pictogram.ts`, round caps and joins, filled round head, 5 px stroke on a 64 grid, white halo when shown over anything but white.
- **Stars** use the existing five-point `clip-path`.
- No emoji in the UI, no icon font. The only other glyphs are `×` in the combo and `★` in leaderboard rows.

## Do's and Don'ts

**Do**

- Put `ink` text on every candy colour.
- Keep the hint banner on screen, unobstructed and at full size, whenever it has something to say.
- Give every coloured signal a word next to it.
- Keep the coach's area free during the song.
- Use one card, one button style and one chip style on every screen.
- Tint shadows grape.

**Don't**

- Don't use red, anywhere, for anything.
- Don't outline text or add hard black drop shadows. Don't use black borders.
- Don't put white text on candy colours.
- Don't darken the stage to make the UI pop; lighten the UI's surfaces instead.
- Don't shake, flash or buzz on a miss.
- Don't add a second button or a keyboard shortcut to the player's flow.
- Don't use `backdrop-filter` or blur during the song.
- Don't reuse Just Dance's logo, font, exact colours or layout.
