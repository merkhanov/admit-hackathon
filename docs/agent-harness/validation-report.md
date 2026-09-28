# Validation Report — Phase 6

Date: 2026-08-26. All tests ran against real projects or a real bootstrap; command output quoted from actual runs.

## Test 1 — Web project (nukualofa): PASS

- Dev server started (port 3001); sight loop ran end-to-end: before snapshot → visible tweak (red top border on Landing wrapper) → after snapshot → `visual-diff.sh`.
- odiff caught the change on desktop ("Found 2161 different pixels (0.01%)", exit 1, mask written) and reported mobile **identical** — the tweak was invisible at 390px. Reading the mask showed the change landed as a small mark below the hero, not a site-wide border. A blind agent would have claimed success; the loop disproved two assumptions in one run.
- Console capture surfaced the known real defect at both viewports (`/logo-wordmark.png` aspect-ratio warning).
- Tweak reverted cleanly (`git checkout`, working tree back to clean). Doc index generated: 1,906 lines.
- Time from cold start to verified-and-reverted: ~4 minutes.

## Test 2 — Automation project (san-diego): PASS, with one bug found and fixed

- Permissions template installed as `.claude/settings.json` (script names adapted to its package.json).
- Deny rule verified headlessly: `cat .env.example` → "both the Bash command and a direct file read were blocked by permission settings". (Note: deny also catches harmless `.env.example` — accepted as safe-side overbreadth.)
- `monitor.sh` ran live (read-only, `claude -p`, $1.34, ~6 min): executed `npm run batch:report` for real data and returned a structured verdict.
- **Bug found by validation:** `claude -p --output-format json` wraps the model's answer in an envelope; the original `jq .verdict` read null → false "critical". Fixed (extract `.result`, unfence, parse; unparseable → critical by design). Replay of the captured envelope: verdict `warn` extracted, dead-man ping sent `verdict=warn`, ntfy correctly silent; injected critical → urgent push delivered to mock. All alert traffic went to a localhost mock; no external services contacted.
- **Real operational finding from the live run:** ~62 `outreach_autopilot_send` rows stuck in `claimed` since 2026-08-25/26 (mailbox pool 75/day exhausted before the 300/day release cap); today's fix (migration 061) stops new stranding but does NOT clean existing rows, and they are deliberately not marked `failed` — content is aging unsent with no reaper. Surfaced to the user in the session summary.
- Remaining user setup: real `HC_URL` (healthchecks.io check, cron `*/15`, grace ~10m) + unguessable `NTFY_TOPIC` in `~/.config/outreach/monitor.env`, then enable cron.

## Test 3 — Framework loop (/spec → /build auto): PASS, one collision flagged

- Scratch repo: `/spec` produced a correct minimal SPEC.md ($0.33). **Flag:** gstack's `spec` skill bleeds into `/spec` (first attempt ran gstack's five-phase pipeline; after pinning exact skill names in the command files it produced the right artifact but still referenced gstack machinery in prose). If it grates, options: rename the command (e.g. `/sdd-spec`) or remove gstack's `spec` skill dir. `/plan` and `/build` have no collisions.
- `/build auto` first **refused a dirty baseline** (no commits, node_modules untracked) — correct discipline. After baseline commit: planned, stopped at the **single approval gate**, and on approval executed autonomously — `calc.js` + `node:test` suite, **2/2 tests pass**, per-task commits (`add50b1` plan, `c425fa4` implementation). No per-task re-review occurred anywhere. Total framework validation cost ≈ $1.65.

## Test 4 — New-project bootstrap: PASS

- `/tmp/harness-bootstrap-test`: guide followed end-to-end — template CLAUDE.md, `.claude/settings.json`, doc index (3 lines), `npm i -D playwright`, static page served, `verify-ui.mjs` → HTTP 200 both viewports, 0 console errors, 0 network failures.
- Bootstrap-to-first-verified-render: ~3 minutes (playwright install dominated).

## Against the seven Phase 6 criteria

| Criterion | Result |
| --- | --- |
| Understand the project quickly | PASS — orientation file + doc index + existing AGENTS.md; nukualofa cold-start ~4 min |
| Plan before implementation | PASS — /spec + /build's plan-then-gate flow, observed live |
| Inspect a running application | PASS — verify-ui against live dev server, twice |
| Validate changes in the browser | PASS — odiff caught what changed and what didn't; agent read the mask |
| Only relevant modules load | PASS — scratch project ran with core only; MCPs are per-project; chrome-devtools on-demand |
| Faster/clearer than previous setup | PASS with evidence — sight loop 6.2s vs blind sessions; single approval gate vs double review; plugins 39→3 enabled |
| No context overload | PASS — always-on additions ≈ 0.4k tokens (5 skill descriptions + 5 command stubs); removals ≈ several k (superpowers hook+skills, 36 plugins, 4 MCPs, BrowserOS schema out of non-outreach sessions) |

## Known limits / follow-ups

1. `gen-doc-index.sh` output scales with corpus (roseau: 829 lines ≈ 23k tokens — read-on-demand tier, not always-on; acceptable but prune via "Where NOT to look" when filling orientation files).
2. `/spec`↔gstack-`spec` naming collision (above) — cosmetic now, rename if it causes drift.
3. healthchecks.io/ntfy need one-time account/topic setup by the user before the monitor goes on cron.
4. san-diego stuck-rows cleanup (the monitor's live finding) is real outreach work, outside harness scope.
5. Scratch artifacts left at `/tmp/harness-bootstrap-test` (disposable); eval clones remain in `.context/eval/` (gitignored, source for future re-installs).
