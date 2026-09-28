# Product

## Register

product

## Users

Hackathon jurors and casual players who open a link and dance in front of a laptop or phone camera for the first time. They stand 1.5–2 m from the screen, often in a lit room, sometimes seated, and they read the screen from across the room while moving. Nobody has read instructions. The job: copy the coach's moves to the music, understand instantly whether each move counted, and know exactly what to fix when it didn't.

Two situations matter most:

- **The juror demo.** A laptop on a table, a juror stepping back from it, sometimes other people watching over their shoulder. They give the game one song to prove the error mode works. Whatever they see in those 64 seconds is the product.
- **The phone in hand, then propped up.** A player opens the link on a phone, taps the start button, leans the phone against something and steps back. The screen is small and far away, so only the biggest elements count.

## Product Purpose

Motion Dance turns a webcam into a dance controller: the player mirrors an on-screen coach, each move is judged part by part (arms, elbows, lean, squat), and a mistake produces a concrete correction such as "Левая рука: подними выше на 45°". Success is a first-time player finishing a song, seeing a clear score, and dancing better on the second try because the hints told them how.

The error mode is the hackathon's judging criterion, so it is the product's centre, not a feature among others: the hint after each move, the ghost target in the camera window, the live hints in the warm-up, the framing hints and the post-song breakdown.

## The Journey

Every screen exists to get the player into the song and back into it again. Each one has a single job:

| Moment | The player's question | What the screen answers |
|---|---|---|
| Intro | What is this and what do I do? | One sentence, four example moves, one button. |
| Loading | Is it working? | Progress with a number, and a reminder to allow the camera. |
| Camera error | What went wrong and how do I fix it? | The reason in plain words and a retry button. |
| Calibration | Where do I stand? | "Stand straight, arms down", a ring that fills while they hold still, framing hints if they are cut off. |
| Warm-up | How does mirroring work? | Three poses, one at a time, with a pictogram, a hold bar and a live correction. |
| Countdown | When do I start? | 3, 2, 1 and the song's name. |
| Song | Did that move count? What do I fix? | A rating word after every move, a hint for the worst body part, the ghost target, the score and star gauge. |
| Results | How did I do and how do I get better? | Stars, score, rating counts, accuracy per body part, the three things to work on, local records. |
| Replay | How do I go again without touching anything? | "Raise a hand over your head", after a short lock so a celebrating player doesn't restart by accident. |

After the camera permission click the whole loop runs on gestures. Nothing may ask for a tap, a key or a mouse.

## Brand Personality

Friendly, joyful, kid-safe. The voice is an encouraging dance teacher: short, warm, specific, never scolding. Emotional goals: instant delight when a move lands, zero confusion when it doesn't. Structure is borrowed from Just Dance Now gameplay (full-bleed stage, a rating word after each move, a star gauge, pictograms sliding in), but the identity is our own.

Three words: **bright, bouncy, clear.**

## Voice

All copy is Russian and addresses the player as «ты». A hint is an instruction the player can do right now, while dancing.

- **Name the body part first, then the action, then the amount.** «Левая рука: подними выше на 45°», not «Угол левой руки недостаточен».
- **Left and right are the player's own**, as in a mirror. The copy never makes them translate.
- **Numbers only when they help.** Degrees for arms and lean; for the squat, a plain «Присядь ниже».
- **Praise is short, fixes are specific.** «Отлично!» is enough for a success; a correction gets the full sentence.
- **Blame the setup, not the player.** «Не вижу левую руку: держи её в кадре», not «Ты вышел из кадра».
- **No exclamation marks on bad news**, no «Ошибка», no «Неправильно».
- **Sentences, not labels**, on anything longer than a chip. Short enough to read in one glance from 2 m: one line for a hint, two at most.

| Instead of | Write |
|---|---|
| Ошибка распознавания | Не видно головы и плеч: отодвинься или наклони камеру |
| Неправильная поза | Правая рука: опусти ниже на 40° |
| Вы проиграли | Танец окончен |
| Нажмите, чтобы продолжить | Подними руку над головой, чтобы станцевать ещё раз |

## Anti-references

- A literal Just Dance clone: no copying its logo, custom font, exact colours or a 1:1 layout. Take the structure, keep our own identity.
- The previous chunky mobile-game look: thick white-rimmed blue panels, heavy black outlines on every element, text with thick strokes and hard drop shadows.
- Night-club darkness: dark, moody, harsh neon that feels adult. This includes the current near-black violet stage.
- Generic dark SaaS: grey cards and admin-panel chrome.
- Fitness-app seriousness: heart-rate charts, calorie counters, clinical body diagrams.

## Design Principles

- **The hint is the hero.** The error-mode correction is the most legible element on screen, readable from 2 m, never covered by the pictogram lane or the camera window.
- **The coach owns the stage.** During play the UI hugs the edges; nothing sits over the dancer.
- **Show, then tell.** The ghost target in the camera window and the coloured skeleton say "where" before the text says "how much".
- **Soft, never scolding.** Misses use warm colours and encouraging copy; nothing flashes red at a child.
- **One look everywhere.** Intro, warm-up, song and results share one card, one button and one chip vocabulary.
- **Every state is visible.** Loading shows a number, the calibration ring fills, the warm-up says when it will move on, the replay lock counts down. The player is never left wondering whether the game froze or stopped seeing them.

## Accessibility & Inclusion

- Readable from 2 m: in-game hint text at least 26 px on desktop, ratings at least 48 px.
- WCAG AA contrast (4.5:1) for all text; ratings and hints carry a word, not just a colour, so colour-blind players get the same information.
- Every animation has a `prefers-reduced-motion` alternative.
- No keyboard or mouse needed after the camera permission click.
- Playable seated and with limited mobility: the song leans on arms and lean, the squat is rare, and a failed warm-up pose moves on by itself after 15 seconds.
- The camera image never leaves the device, and the intro says so.
- Russian UI copy; fonts must include Cyrillic.

## Constraints

- Runs in the browser from one link: no install, no account, no server. Records live in `localStorage` on this device.
- The frame budget is shared with pose recognition and a 3D scene. UI effects are CSS transforms and opacity; no blur filters or layout-changing animations during the song.
- Tested in Chrome only; Firefox and Safari are unverified. Must still work, if less pretty, on the 2D fallback stage when WebGL is unavailable.
- No UI framework: screens are HTML strings and one stylesheet, so the design has to live in CSS custom properties and a small set of reusable classes.

## Success Signals

- A juror finishes the song without asking anyone what to do.
- After a miss, they can say which body part was wrong and in which direction.
- The second run scores higher than the first.
- Someone watching over their shoulder wants a turn.
