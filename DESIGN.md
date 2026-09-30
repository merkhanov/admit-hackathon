---
name: Motion Dance
description: A friendly, kid-safe dance game where the webcam is the controller and every mistake gets a concrete fix.
colors:
  ink: "#271f46"
  ink-soft: "#555075"
  grape: "#8140d0"
  grape-deep: "#6529a9"
  mint: "#56f3c1"
  sunshine: "#ffda4b"
  tangerine: "#ffb36a"
  coral: "#fe8b85"
  sky: "#8cd1fa"
  bubblegum: "#fe8dc5"
  lavender-mist: "#f5f1fc"
  white: "#ffffff"
  stage-lilac: "#9d99ed"
  stage-pink: "#ea9dd9"
  stage-peach: "#ffc1b5"
typography:
  display:
    fontFamily: "Nunito, Trebuchet MS, system-ui, sans-serif"
    fontSize: "clamp(2.8rem, 7vw, 5.2rem)"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  rating:
    fontFamily: "Nunito, Trebuchet MS, system-ui, sans-serif"
    fontSize: "clamp(3rem, 7vw, 5.5rem)"
    fontWeight: 900
    lineHeight: 1
    fontStyle: italic
  headline:
    fontFamily: "Nunito, Trebuchet MS, system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 2.6vw, 2.2rem)"
    fontWeight: 900
    lineHeight: 1.1
  hint:
    fontFamily: "Nunito, Trebuchet MS, system-ui, sans-serif"
    fontSize: "clamp(1.3rem, 2.2vw, 1.75rem)"
    fontWeight: 800
    lineHeight: 1.25
  body:
    fontFamily: "Nunito, Trebuchet MS, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.45
  label:
    fontFamily: "Nunito, Trebuchet MS, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 900
    lineHeight: 1.2
rounded:
  sm: "12px"
  md: "20px"
  lg: "32px"
  pill: "999px"
spacing:
  edge: "clamp(14px, 2.4vw, 28px)"
  card: "clamp(24px, 4vw, 44px)"
components:
  button-primary:
    backgroundColor: "{colors.grape}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "20px 38px"
  button-primary-pressed:
    backgroundColor: "{colors.grape-deep}"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card}"
  chip:
    backgroundColor: "{colors.lavender-mist}"
    textColor: "{colors.grape-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  hint-bubble:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.hint}"
    rounded: "{rounded.lg}"
    padding: "16px 24px 20px"
  score-chip:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 20px 12px"
  camera-window:
    backgroundColor: "#1d1740"
    rounded: "{rounded.md}"
    width: "clamp(160px, 21vw, 290px)"
---

# Design System: Motion Dance

## 1. Overview

**Creative North Star: "The Birthday-Party Dance Floor"**

Motion Dance is the dance game you'd put on at a kid's birthday party. The stage is a bright candy sky over a glowing tiled floor. The coach dances in the middle, and everything else hugs the edges so the room can watch her. The structure comes from Just Dance Now gameplay: a full-bleed stage, a big rating word after each move, a star gauge down the left and pictograms sliding in at the bottom. The identity is our own: rounder type, softer colour and a speech bubble that teaches.

The system is built for a first-time player standing 1.5–2 m from a laptop. Every element is sized for that distance. The error-mode hint is the most legible thing on screen, because PRODUCT.md says "the hint is the hero". Surfaces are solid white cards on a colourful stage. There is no dark mode, no glass and no neon glow on text.

It rejects what PRODUCT.md rules out: a literal Just Dance clone (no borrowed logo, font, exact colours or 1:1 layout), the earlier chunky mobile-game look (thick white-rimmed blue panels, heavy black outlines everywhere), club darkness, and generic dark-SaaS chrome.

**Key Characteristics:**
- Candy-sky stage (lilac → pink → peach) with a floor of pastel-vivid tiles that shift colour on the beat.
- One font, Nunito, from 600 to 900. Heavy italic is reserved for rating words.
- White cards and pill buttons, soft ink-tinted shadows, no borders.
- Colour carries meaning (mint Perfect, tangerine Good, sky OK, coral Miss), and a word always carries the same meaning.
- The in-game layout: score top-left, star gauge on the left edge, camera top-right, hint bubble bottom-left, pictogram lane bottom-right, rating word above the coach.

## 2. Colors: The Party Balloon Palette

A full palette with deliberate roles: one violet for action, four feedback colours, one playful accent, and soft neutrals tinted toward violet. Canonical values are OKLCH in `src/style.css`; the hex values here are their sRGB equivalents.

### Primary
- **Grape** (#8140d0, oklch(0.53 0.21 300)): primary buttons, the star gauge fill, accuracy bars, the selected song card, focus rings. White text on Grape is 5.9:1.
- **Grape Deep** (#6529a9, oklch(0.44 0.19 300)): the pressed edge under buttons, chip text, the player's own row in the live scoreboard.

### Feedback
- **Mint** (#56f3c1): Perfect. The verdict chip, the Perfect stat pill, a finished warm-up pose, on-target limbs in the camera window.
- **Tangerine** (#ffb36a): Good, and a warm-up pose that was skipped.
- **Sky** (#8cd1fa): OK, and the calibration chip.
- **Coral** (#fe8b85): Miss and framing problems. Soft on purpose: nothing flashes red at a child.
- **Sunshine** (#ffda4b): stars, the "almost" hint chip, the dashed target ghost in the camera window, the new-record chip.

### Accent
- **Bubblegum** (#fe8dc5): pictograms and confetti. Pure play, never a state.

### Neutral
- **Ink** (#271f46): all text on light surfaces. 15.4:1 on white.
- **Ink Soft** (#555075): secondary text and labels. 7.6:1 on white.
- **Lavender Mist** (#f5f1fc): quiet surfaces inside cards: stat pills, inputs, song cards, leaderboard rows, meter tracks.
- **White** (#ffffff): every card, bubble and chip that sits on the stage.
- **Stage Lilac / Pink / Peach** (#9d99ed / #ea9dd9 / #ffc1b5): the backdrop gradient only. Never used for text or UI.

### Named Rules
**The Word-Plus-Colour Rule.** A state is never colour alone. Every rating and hint carries its word ("Идеально", "Почти", "Мимо") next to its colour, so colour-blind players read the same thing.

**The Ink-On-Light Rule.** Text on Mint, Sunshine, Tangerine, Sky, Coral and Bubblegum is always Ink (6.7–11.2:1). Never put white text on a light feedback colour.

## 3. Typography

**Display, body and label font:** Nunito (fallback Trebuchet MS, system-ui). One family with Cyrillic, in weights 600, 800, 900 and 900 italic.

**Character:** Rounded terminals make it friendly and kid-safe, and heavy weights keep it readable from across the room. Using one family keeps every screen consistent.

### Hierarchy
- **Display** (900, clamp(2.8rem, 7vw, 5.2rem), 0.95, -0.02em): the logo on the intro card only.
- **Rating** (900 italic, clamp(3rem, 7vw, 5.5rem), 1): the verdict word above the coach, tilted −4°, with a 10 px white outline and a soft ink drop shadow, filled with the rating's colour.
- **Countdown** (900 italic, clamp(7rem, 22vw, 14rem)): white fill with a 14 px Grape outline.
- **Headline** (900, clamp(1.6rem, 2.6vw, 2.2rem), 1.1): card titles such as "Встань ровно и опусти руки" and "Лобби".
- **Hint** (800, clamp(1.3rem, 2.2vw, 1.75rem), 1.25): the error-mode correction. At least 26 px on desktop.
- **Body** (600, 1rem, 1.45): explanations. Lines capped at about 60–64ch.
- **Label** (900, 0.95rem, 1.2): chips, stat captions, button text. Sentence case.

### Named Rules
**The Italic-Means-Verdict Rule.** Heavy italic appears only in rating words and the countdown. Nothing else leans.

**The No-Tracked-Caps Rule.** No small uppercase letter-spaced eyebrows. Labels are sentence-case chips.

## 4. Elevation

The system is flat with soft lifts. Cards and bubbles float above the stage on diffuse shadows tinted with Ink, never grey or black. Nothing inside a card has a shadow except the selected song card. Depth on the stage itself comes from 3D lighting (ACES tone mapping, a soft key shadow, coloured rim lights), not from UI effects.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 18px 50px -12px oklch(0.27 0.07 290 / 0.35)`): intro, warm-up, lobby and results cards, the hint bubble, the camera window.
- **Float** (`box-shadow: 0 10px 30px -8px oklch(0.27 0.07 290 / 0.35)`): small floating pieces: the score chip, the live scoreboard, the pictogram ring, the selected song card.
- **Pressed edge** (`box-shadow: 0 6px 0 {colors.grape-deep}`): under primary buttons, so they feel tactile. It shrinks to 1 px while pressed.
- **State ring** (`box-shadow: 0 0 0 6px {colors.mint}` / `{colors.tangerine}` / `{colors.coral}`): a thick soft ring around a card that marks a state: warm-up pose done, pose skipped, framing problem.

### Named Rules
**The No-Glow-On-Text Rule.** Text never glows. Rating words get a white outline and a drop shadow; everything else is plain ink on white.

## 5. Components

### Buttons
Tactile and friendly, like a toy button.
- **Shape:** pill ({rounded.pill}).
- **Primary:** Grape background, white Nunito 900 at 1.25rem, padding 20px 38px, 6 px Grape Deep pressed edge.
- **Hover / Active / Focus:** lifts 2 px on hover; drops 5 px on press, and the edge collapses; a 4 px Sunshine focus ring with a 4 px offset.
- **Compact:** inside the lobby, padding 14px 26px at 1.05rem.
- **Text link** (`.link-btn`): Ink Soft, underlined, for "Отмена" and "Покинуть".
- **Close** (`.menu-x`): a 44 px Lavender Mist circle with an ink ×, top-right of the lobby and results cards.

### Chips
- **Style:** Lavender Mist background, Grape Deep label text, pill, padding 6px 14px. The chip replaces every eyebrow.
- **Variants:** a Sunshine chip marks a new record. Hint-bubble chips take the tone colour (Sunshine "Почти", Coral "Мимо", Mint "Идеально", Sky "Калибровка").

### Cards
- **Corner style:** {rounded.lg} (32 px).
- **Background:** White. Quiet inner surfaces use Lavender Mist at {rounded.md} or {rounded.sm}.
- **Shadow:** Card (see Elevation). No borders.
- **Padding:** clamp(24px, 4vw, 44px).
- **Placement:** calibration and warm-up cards sit top-left on desktop and bottom-full-width on phones, so the coach stays visible.

### Inputs
- **Style:** Lavender Mist fill, 3 px transparent border, {rounded.md}, Nunito 800 at 1.1rem.
- **Focus:** the border turns Grape.

### Hint Bubble (signature component)
The error-mode correction, and the most important element on screen.
- White card, {rounded.lg}, bottom-left at the edge inset, up to 640 px wide (full width on phones).
- A tone chip on top ("Почти", "Мимо", "Идеально", "Калибровка", "Поправь кадр"), the correction in Hint type, and a 12 px match meter.
- A framing problem adds a Coral state ring.
- It never overlaps the pictogram lane (bottom-right) or the camera window (top-right).

### In-game HUD
- **Score chip:** a white card top-left with the "Очки" label, the score in 2.2rem 900 tabular numbers, and a Mint "Комбо ×N" pill from a combo of 2.
- **Star gauge:** a vertical 18 px track down the left edge that fills with Grape from the bottom. Five 44 px stars sit exactly at their thresholds (20, 40, 60, 75, 90 % of the maximum score) and turn Sunshine when earned.
- **Rating word:** Rating type above the coach's head for 0.9 s per move.
- **Pictogram lane:** bottom-right, no frame, fading out towards the right edge. Coloured stick figures with a white halo slide left and reach a translucent 104 px "now" ring on the beat. The current one grows to 112 %.
- **Camera window:** top-right, a 5 px white border, {rounded.md}, a dark grape inside. Limbs are Mint on target, Sunshine close and Coral off. The target arms appear as a dashed Sunshine ghost.

### Song picker
- **Song cards:** in the lobby, a grid of Lavender Mist cards at {rounded.md}, two or three across on desktop and one per row on phones. Each card has the song's signature pictogram (44 px, Grape), the title in 900, the credit in Grape and the length and move count in Ink Soft.
- **Selected card:** white fill, a 3 px Grape border and the Float shadow, with `aria-pressed="true"`. The selected song's dances and coach go in one line under the grid, not on every card.
- **Guests in a room** see the same cards without buttons: only the host picks.
- **Own-song picker:** a dashed lavender box under the grid, solo only. It has three states. Idle says which files work and that the file stays on the device. Loading says «Слушаю «…» и ищу ритм…». Error gives the reason with a Coral border.
- **Song themes:** each song brings its own stage (backdrop, floor, rim lamps) and a hat for the coach: none, cap, papakha, bow, crown or kalpak. Theme colours stay in the candy palette, and every backdrop is light.
- **Song switch:** on the results screen in solo play, one line above the restart prompt names the previous song on the left and the next one on the right.

### Motion
- 180–260 ms state transitions on `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart family).
- The rating word pops in on ease-out-expo over 900 ms: scale 0.6 → 1, hold, fade up. No bounce, no elastic.
- Every animation collapses to an instant change under `prefers-reduced-motion`.

## 6. Do's and Don'ts

### Do:
- **Do** keep the hint bubble the largest block of text in play: at least 26 px, Ink on white, bottom-left.
- **Do** pair every feedback colour with its word (The Word-Plus-Colour Rule).
- **Do** use Ink text on every light feedback colour; contrast is 6.7:1 or better.
- **Do** keep the coach's area free: UI lives in the four corners and the left edge.
- **Do** use one font (Nunito) and reserve heavy italic for ratings and the countdown.
- **Do** use the layer scale: fx 10, HUD 20, hint 30, screens 40, camera 50.

### Don't:
- **Don't** build a literal Just Dance clone: no copying its logo, custom font, exact colours or a 1:1 layout.
- **Don't** bring back the chunky mobile-game look: no thick white-rimmed blue panels and no heavy black outlines on every element.
- **Don't** make it club-dark or harsh neon. The stage stays a candy sky.
- **Don't** use grey admin-panel cards or dark-SaaS chrome.
- **Don't** put small uppercase tracked eyebrows above headings. Use a chip.
- **Don't** use gradient text, glowing text or glassmorphism.
- **Don't** put white text on Mint, Sunshine, Tangerine, Sky, Coral or Bubblegum.
- **Don't** flash red or scold on a miss. Use Coral and a specific, encouraging correction.
