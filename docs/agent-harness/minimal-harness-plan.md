# Minimal Claude Code Harness Implementation Plan — v2

> **For agentic workers:** Execute inline, task-by-task, checking boxes (`- [ ]`) as you go. Per the user's explicit direction, do NOT use superpowers:subagent-driven-development (rejected for double-review overhead). Verify each task's step before moving on.

**Goal:** Close the P0 gaps (blind visual work, re-orientation tax) and P1 gaps (context overload, outreach fragility) with the evidence-selected minimal set: agent-skills as the SDLC framework, Playwright+odiff for sight, Mailpit for send-safety, two scoped MCPs for Next/Supabase introspection, and a shrinking — not growing — global config.

**Architecture:** Thin always-on core (5 framework skills + orientation file + permissions); everything else on-demand (commands, per-project `.mcp.json`, temp MCP configs, module templates in this repo copied into projects only when applicable).

**Tech Stack:** agent-skills v0.6.7 (selective copy), Node/Playwright (per-project), odiff-bin, Mailpit binary, bash, Claude Code native config, Octarin (existing).

**Spec:** `docs/agent-harness/workflow-baseline.md` (gaps) + `claude-code-operating-principles.md` (rules) + `tool-evaluation.md` incl. Round 2 (adoption decisions + PoC evidence). User decisions: agent-skills replaces superpowers as framework; karpathy stays; no per-task re-review anywhere.

## Global Constraints

- Never commit secrets; templates reference env vars only; prod send-keys live outside repo trees.
- Root context files hard-capped at ~150 lines. No new always-on capability without evidenced near-daily use.
- Every `~/.claude` change is backed up first (`*.bak-harness`) and has a one-step rollback noted inline.
- Repo work commits in this repo (branch `itsaibarr/stuttgart`); global-config tasks verify by command output.
- Copy-sources are the existing eval artifacts: `.context/eval/agent-skills/`, `.context/eval/web-quality-skills/`, `.context/eval/mailpit-poc/`, `.context/eval/poc/`, `.context/eval/harness-eval/`. Do not re-download what exists.

---

### Task 1: Scaffold + decision log

- [ ] `mkdir -p agent/core/commands agent/modules/{web-development,automation,research} agent/templates`
- [ ] Write `agent/README.md` (layer map: core always-on / modules copied on demand / templates for bootstrap; pointer to `docs/agent-harness/`).
- [ ] Write `docs/agent-harness/decision-log.md`: table Date | Decision | Evidence | Status, one row per verdict in `tool-evaluation.md` Rounds 1+2 (BrowserOS optional-scoped, browser-harness reject, Playwright adopt, gstack-daemon adapt, web-quality adapt, agent-skills ADOPT-as-framework (supersedes R1 reject — user decision), karpathy keep (supersedes R1 remove — user decision), MemPalace reject, Graphify reject, odiff adopt, next-devtools-mcp adopt-scoped, Supabase MCP adopt-scoped, chrome-devtools-mcp on-demand, playwright-mcp reject, Mailpit adopt, spam-mode adapt, healthchecks+ntfy adopt, imap-verify adapt, scraper pattern-only, secrets config-hardening-only, superpowers disable).
- [ ] Commit: `git add agent docs/agent-harness/decision-log.md && git commit -m "feat(harness): scaffold + full decision log"`

### Task 2: Framework migration — agent-skills in, superpowers off (persistent, approved)

Exact steps from the migration design (validated against clone @ 5a5ea45):

- [ ] `cd .context/eval/agent-skills && git pull` (refresh; note new HEAD in decision log if changed)
- [ ] Copy 5 skills: `for s in planning-and-task-breakdown incremental-implementation test-driven-development spec-driven-development interview-me; do cp -R .context/eval/agent-skills/skills/$s ~/.claude/skills/; done`
- [ ] Copy shared references: `mkdir -p ~/.claude/references && cp .context/eval/agent-skills/references/{definition-of-done.md,testing-patterns.md} ~/.claude/references/`
- [ ] Copy 3 commands: `cp .context/eval/agent-skills/.claude/commands/{spec,plan,build}.md ~/.claude/commands/`
- [ ] Edit the three copied commands: replace every `agent-skills:` prefix with bare skill name; in `build.md` additionally: `agent-skills:debugging-and-error-recovery` → `investigate` (gstack), `agent-skills:doubt-driven-development` → "stop and get explicit user sign-off".
- [ ] Backup then edit `~/.claude/settings.json`: `cp ~/.claude/settings.json ~/.claude/settings.json.bak-harness`; set `"superpowers@claude-plugins-official": false`.
- [ ] Append to `~/.claude/CLAUDE.md`:
```markdown
# SDLC loop
Define -> /spec -> /plan -> /build (or /build auto for a whole approved plan). One approval gate; no per-task re-review. Review = /code-review once, pre-merge. Ship via gstack ship / vercel:deploy. For all code edits, follow karpathy-guidelines (surgical changes, simplicity first).
```
- [ ] Also mirror the 5 skills + 3 commands into `agent/core/framework/` in this repo (the committed master copy) and commit: `git commit -m "feat(framework): agent-skills selective adoption (5 skills, 3 commands)"`
- [ ] Verify: fresh session lists the 5 new skills, no `superpowers:*` skills, `/plan` resolves. Rollback: flip the plugin boolean back; `rm -rf` the 5 skill dirs + 3 commands + 2 references; delete the CLAUDE.md block.

### Task 3: Web module — sight loop (verify + diff)

- [ ] Write `agent/modules/web-development/verify-ui.mjs`:
```js
#!/usr/bin/env node
// Usage: node verify-ui.mjs <url> [outDir]  — run from the project root (needs playwright in node_modules)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');
const url = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? '.context/verify';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const consoleLines = [], failures = [];
for (const [name, width, height] of [['desktop-1440', 1440, 900], ['mobile-390', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('console', m => (m.type() === 'error' || m.type() === 'warning') && consoleLines.push(`[${name}] ${m.type()}: ${m.text()}`));
  page.on('requestfailed', r => failures.push(`[${name}] ${r.failure()?.errorText} ${r.url()}`));
  page.on('response', r => r.status() >= 400 && failures.push(`[${name}] HTTP ${r.status()} ${r.url()}`));
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  console.log(`${name}: HTTP ${resp?.status()}`);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  await page.close();
}
await browser.close();
writeFileSync(join(out, 'console.txt'), consoleLines.join('\n') || 'clean');
writeFileSync(join(out, 'network-failures.txt'), failures.join('\n') || 'clean');
console.log(`artifacts: ${out}; console: ${consoleLines.length}; network failures: ${failures.length}`);
if (consoleLines.some(l => l.includes('error:')) || failures.length) process.exit(1);
```
- [ ] Write `agent/modules/web-development/visual-diff.sh`:
```bash
#!/usr/bin/env bash
# Usage: visual-diff.sh <before-dir> <after-dir> — diffs matching PNGs, prints mask paths.
set -euo pipefail
fail=0
for b in "$1"/*.png; do
  a="$2/$(basename "$b")"; m="$2/$(basename "$b" .png).diff.png"
  [ -f "$a" ] || { echo "MISSING $a"; fail=1; continue; }
  if npx odiff-bin "$b" "$a" "$m" --antialiasing --threshold 0.1; then
    echo "SAME $(basename "$b")"
  else
    code=$?; [ "$code" = 21 ] && echo "DIMENSION-MISMATCH $(basename "$b")" || echo "CHANGED $(basename "$b") — READ the mask: $m"; fail=1
  fi
done
exit $fail
```
- [ ] Write module README: workflow = shoot before → edit → shoot after → diff → **Read the mask PNG and describe what changed**; `npx lighthouse <url>` for perf audits; gstack daemon binary for click/fill (`~/.claude/skills/gstack/browse/dist/browse`, never the skill); chrome-devtools-mcp on-demand recipe for perf-trace/throttle/heap sessions: `claude --mcp-config '{"mcpServers":{"chrome-devtools":{"command":"npx","args":["chrome-devtools-mcp@latest","--no-usage-statistics"]}}}'` (never resident — 7.4k tokens).
- [ ] Write `agent/modules/web-development/mcp-template.json` (per-project, Next+Supabase repos only; PAT via env, never inline):
```json
{
  "mcpServers": {
    "next-devtools": { "command": "npx", "args": ["next-devtools-mcp@latest"] },
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest", "--read-only", "--project-ref=<DEV_PROJECT_REF>", "--features=database,debugging"],
      "env": { "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}" }
    }
  }
}
```
- [ ] Verify: rerun the proven loop against nukualofa dev server (start, `node verify-ui.mjs`, copy artifacts as `before/`, rerun as `after/`, `visual-diff.sh before after` → all SAME, exit 0; kill server). Also `npx odiff-bin --help` exits 0.
- [ ] Commit: `git add agent/modules/web-development && git commit -m "feat(web): sight loop — verify-ui + odiff diff + scoped MCP template"`

### Task 4: Core — orientation + doc index + wrap-session

- [ ] Write `agent/core/ORIENTATION-TEMPLATE.md`:
```markdown
# <Project> — Orientation (hard cap: 150 lines. If adding, delete something.)
## What this is
<2 sentences: system + who it serves>
## Stack & commands
<one line per: dev, test, typecheck, lint, deploy; project CLIs with a 5-word purpose each>
## Load-bearing files (10–15 max)
<path — why it matters, one line each>
## Settled decisions (do not relitigate)
<decision — why, one line each; move overflow to Octarin memory_record_decision>
## Gotchas
<one line each>
## Where NOT to look
<dirs/globs that are archive, generated, or vendor — explicitly de-weighted>
## Doc index
Generated: see `.context/DOC-INDEX.md` (regenerate: `bash agent/core/gen-doc-index.sh`)
```
- [ ] Write `agent/core/gen-doc-index.sh`:
```bash
#!/usr/bin/env bash
# Generates a compact doc index: path + first heading, one line per md file.
set -euo pipefail
root="${1:-.}"; out="$root/.context/DOC-INDEX.md"; mkdir -p "$root/.context"
{ echo "# Doc index — generated $(date +%F), $(find "$root" -name '*.md' -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l | tr -d ' ') files"
  find "$root" -name '*.md' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/vendor/*' | sort | while read -r f; do
    h=$(grep -m1 '^#' "$f" 2>/dev/null | cut -c1-80 || true)
    echo "- ${f#"$root"/} — ${h:-'(no heading)'}"
  done; } > "$out"
echo "wrote $out ($(wc -l < "$out" | tr -d ' ') lines)"
```
- [ ] Verify: `bash agent/core/gen-doc-index.sh ~/conductor/workspaces/aibar/roseau` → ~2,278 lines, < ~8k tokens (`wc -c`/4 ≈ tokens).
- [ ] Write `agent/core/commands/verify-ui.md`:
```markdown
Detect the running dev server port (check terminal output or try 3000/3001/5173). Run:
`node ~/conductor/workspaces/coding-set-up/stuttgart/agent/modules/web-development/verify-ui.mjs http://localhost:<port>`
Then READ both PNGs with the Read tool and report: what the page actually looks like at 1440 and 390, every console error, every failed request. If anything is wrong, fix and re-run before claiming done. $ARGUMENTS may override the URL.
```
- [ ] Write `agent/core/commands/wrap-session.md`:
```markdown
Session wrap-up. 1) List durable findings from this session (decisions + why, gotchas, load-bearing files discovered). 2) Fold them into the project's root CLAUDE.md/AGENTS.md orientation sections — keep it under its 150-line cap, deleting stale lines to make room. 3) Record repo-anchored decisions via Octarin memory_record_decision (what + why + files). 4) If docs changed, rerun gen-doc-index.sh. Report what was written where. $ARGUMENTS
```
- [ ] Copy both into `~/.claude/commands/`; verify they appear in a fresh session's command list.
- [ ] Commit masters: `git add agent/core && git commit -m "feat(core): orientation template, doc index, verify-ui + wrap-session commands"`

### Task 5: Automation module — send-safety + observability

- [ ] Promote PoC: `cp .context/eval/mailpit-poc/{verify-send.mjs,imap-batch-verify.mjs} agent/modules/automation/` and copy the mailpit binary path note (binary stays out of git; README records download: `curl -sL https://github.com/axllent/mailpit/releases/latest/download/mailpit-darwin-arm64.tar.gz | tar xz -C ~/.local/bin mailpit`).
- [ ] Write `agent/modules/automation/monitor.sh` (extends plan v1 Task 5 with the alert pair):
```bash
#!/usr/bin/env bash
# Cron: */15 * * * * — read-only queue health + dead-man ping + urgent push. $1 = repo path.
# Env (from ~/.config/outreach/monitor.env, NOT in repo): HC_URL, NTFY_TOPIC
set -uo pipefail
source "$HOME/.config/outreach/monitor.env"
cd "$1"
claude -p "Read-only check, do not modify anything: inspect the outreach queue state (queue-status scripts or Supabase queue tables via existing read scripts) and last send log. Report JSON: {queue_depth, oldest_pending_hours, sends_last_24h, failures_last_24h, stale_content_risk, verdict: \"ok\"|\"warn\"|\"critical\", reason}." \
  --allowedTools "Read,Grep,Glob,Bash(node scripts/*status*),Bash(npm run geo:report)" \
  --output-format json > /tmp/queue-health.json
verdict=$(jq -r '.verdict // "critical"' /tmp/queue-health.json 2>/dev/null || echo critical)
curl -fsS -m 10 "$HC_URL" -d "verdict=$verdict" >/dev/null || true   # dead-man: silence = alert
if [ "$verdict" = "critical" ]; then
  curl -fsS -m 10 -H "Priority: urgent" -H "Title: Outreach CRITICAL" \
    -d "$(jq -c '{verdict,reason,queue_depth}' /tmp/queue-health.json)" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null || true
fi
```
- [ ] Write `agent/modules/automation/permissions-template.json` (adjust script names per repo from its package.json before copying; the shape is the deliverable):
```json
{
  "permissions": {
    "allow": [
      "Bash(npm run test:*)", "Bash(npm run typecheck)", "Bash(npm run lint)",
      "Bash(npm run campaign:seed)", "Bash(npm run geo:report)",
      "Bash(node scripts/queue-status*)", "Bash(npx tsx scripts/*--dry-run*)"
    ],
    "ask": [
      "Bash(npm run go-live)", "Bash(npm run campaign)", "Bash(npm run cutover*)",
      "Bash(*--send*)", "Bash(*--live*)"
    ]
  }
}
```
PLUS deny rules: `"deny": ["Read(./.env*)", "Bash(cat *.env*)", "Bash(grep * .env*)", "Bash(node --env-file*--live*)"]` — and README note: verify the deny list in a live session by attempting `cat .env` (must be blocked); prod keys move to `~/.config/outreach/prod.env`, injected via `node --env-file` only in the already-gated live-send commands.
- [ ] Write module README covering: verify-before-send wiring (nodemailer host swap to 127.0.0.1:1025 in dry-run mode; `MP_ENABLE_SPAMASSASSIN=postmark` advisory scoring — flag that content goes to Postmark's hosted checker; live send gated on `verify-send.mjs` exit 0), monitor cron + healthchecks.io setup (free tier, cron schedule + grace; ntfy integration so one phone app gets both), unguessable ntfy topic = credential, imap-batch-verify post-send ground truth (read-only mailbox creds), scraper pattern (zod contract fixtures + live canary soft-failing to ntfy).
- [ ] Verify: `bash -n` both scripts parse; run `verify-send.mjs` against a locally started mailpit exactly as the PoC did (good → exit 0, stale fixture → exit 1); stop mailpit.
- [ ] Commit: `git add agent/modules/automation && git commit -m "feat(automation): Mailpit verify-before-send, dead-man monitor, secrets hardening"`

### Task 6: Adopt accessibility skill + perf references (persistent, approved)

- [ ] `cp -R .context/eval/web-quality-skills/skills/accessibility ~/.claude/skills/accessibility-audit && cp .context/eval/web-quality-skills/skills/core-web-vitals/references/{INP,CLS}.md ~/.claude/skills/optimizing-web-performance/references/`
- [ ] Verify: fresh session lists `accessibility-audit`; invocation runs `npx lighthouse --only-categories=accessibility` rather than generic advice.

### Task 7: Context diet — global config (persistent, approved; superpowers already handled in Task 2)

- [ ] Backup: `cp ~/.claude.json ~/.claude.json.bak-harness` (settings.json already backed up in Task 2).
- [ ] `~/.claude/settings.json` `enabledPlugins`: set the 34 `@designer-skills` entries, `clay@clay-plugins`, and `mcpmarket-me@mcpmarket-me` to `false` (zero appearances in 3 months of session history; one-edit reversible). Keep: vercel, mattpocock-skills, karpathy-skills.
- [ ] `~/.claude.json` MCP diet: remove `goldfish` from `*` scope; remove global `higgsfield`, `miro`, `canva` (unauthenticated/unused; re-add via `claude mcp add` when needed); move `browseros-neo` to project scope for `~/conductor/repos/outsource-agency` and `~/conductor/repos/geo` only. Keep global: context7, octarin, pencil, railway.
- [ ] Permissions allow (global settings.json): `"Bash(npm run test:*)", "Bash(npm run typecheck)", "Bash(npm run lint)", "Bash(npm run build)", "Bash(npm run dev)", "Bash(npx playwright *)", "Bash(npx lighthouse *)", "Bash(npx odiff-bin *)", "Bash(git status)", "Bash(git diff *)", "Bash(git log *)"`.
- [ ] Verify: fresh session in scratch dir — skill listing visibly shorter, `claude mcp list` shows reduced set, `npm run typecheck` in nukualofa runs unprompted, gstack + Octarin hooks still fire. Rollback: restore both `.bak-harness` files.

### Task 8: Research module + bootstrap guide

- [ ] Write `agent/modules/research/evidence-card.md` (table: `Claim | Evidence (verbatim quote + source) | Confidence | Refutes/Supports`), `source-register.md` (table: `Source | Type | Reliability | Last checked | Used in`), and `README.md`: activate only for multi-session research; findings graduate into the orientation file or Octarin at `/wrap-session`, never accumulate as loose files (the 2,278-file lesson); no retrieval tooling — rejected with evidence in tool-evaluation.md.
- [ ] Write `agent/templates/CLAUDE.md` (filled example of the orientation template), `agent/templates/settings.json` (project permissions starter = Task 7 allow-list minus git plus dev), `agent/templates/mcp-template.json` (symlink note to web module's).
- [ ] Write `docs/agent-harness/new-project-bootstrap.md` — first-session sequence: copy template CLAUDE.md and fill during first codebase-Q&A; `gen-doc-index.sh`; copy settings template; if web: playwright devDep + `/verify-ui` noted in commands section + `.mcp.json` from template when Next/Supabase; if automation: copy automation module; define via `/spec` → `/plan` → `/build`; end with `/wrap-session`. Definition of done for session 1: real orientation file, doc index, one passing `/verify-ui` (web).
- [ ] Commit: `git add agent docs/agent-harness/new-project-bootstrap.md && git commit -m "docs(harness): research templates + bootstrap guide"`

### Task 9: Validation on real projects (Phase 6)

- [ ] Web (nukualofa): fresh session — orient from its (new) orientation file, trivial visible UI tweak on a branch, `/verify-ui` + before/after `visual-diff.sh`, agent must describe the mask; revert. Record time-to-oriented and that only web-module pieces loaded.
- [ ] Automation (san-diego): run `monitor.sh` read-only against a test HC/ntfy pair; confirm JSON verdict + hc ping + (simulated critical) ntfy push; confirm live-send commands still prompt and `cat .env` is denied.
- [ ] Framework: run one real small feature through `/spec` → `/plan` → `/build auto` end-to-end in a scratch or real repo; confirm single approval gate, no re-review loop, per-task commits.
- [ ] Bootstrap: `/tmp/harness-bootstrap-test` minimal Next or static page, follow the guide end-to-end.
- [ ] Write `docs/agent-harness/validation-report.md` — per test, pass/fail against the seven Phase 6 criteria with command output; failures become appended fix tasks. Commit.

---

## Self-review notes

- Coverage: framework pivot → Task 2; P0 sight → Task 3; P0 orientation → Task 4; P1 outreach (all 4 incidents mapped) → Task 5; P2 a11y/perf → Task 6; P1 overload → Tasks 2+7; deliverables (decision log, bootstrap, validation) → Tasks 1, 8, 9.
- Persistent-change gate: Tasks 2, 4 (command copies), 6, 7 touch `~/.claude`; each has backup + one-step rollback inline.
- Consistency: command names (`/spec /plan /build /verify-ui /wrap-session`), script paths, and the 150-line cap are uniform across Tasks 2–5, 8; odiff exit codes (0/21/22) per measured PoC.
