# Workflow Baseline — Phase 1 Audit

Date: 2026-08-26. Evidence: local filesystem (`~/conductor`, `~/.claude`), git history since 2026-05-26, and 25+ Octarin session records for this user over the same window. No repository descriptions were used as evidence.

## Actual development profile (last 3 months)

**Active projects** (all in Conductor workspaces, work happens on branches, base repos are near-empty):

| Project | Location | Stack | Type | Activity |
| --- | --- | --- | --- | --- |
| san-diego (outsource-agency) | `~/conductor/workspaces/outsource-agency/san-diego` | Next.js 16, React 19, TS, Tailwind v4, Supabase, GSAP/Lenis/OGL; nodemailer, imapflow, resend, cheerio | Portfolio site + cold-email outreach engine in one repo | 141 commits |
| nukualofa (geo) | `~/conductor/workspaces/geo/nukualofa` | Next.js, TS, Supabase, GSAP, resend/nodemailer/imapflow, scrapers, Playwright 1.62 (devDep, installed, no playwright.config) | GEO service + outreach engine (PECR gates, queues, cutover scripts) | 797 commits |
| roseau (aibar) | `~/conductor/workspaces/aibar/roseau` | Python (requirements.txt), Supabase, scrapers, pytest (353 tests green per session log) | Opportunity tracker / research automation | 132 commits |
| portfolio / geo site | same workspaces | Next.js + Vercel deploy | Marketing/portfolio web | ongoing |

**Recurring engineering tasks** (from session history): scroll/video animation work (GSAP/Lenis/OGL), responsive + font/localization fixes, outreach queue operations (batch sends, kill-switches, throughput debugging), Supabase data checks, Vercel deploys, long research/validation sessions.

**Verification state**: vitest wired in both TS projects (`test`, `typecheck`, `lint` scripts exist); pytest in roseau. No E2E harness anywhere (no playwright.config in any project). No Lighthouse/axe tooling in any package.json.

## Existing Claude Code environment

- **Global**: `~/.claude/CLAUDE.md` 39 lines (Octarin) + `rules/context7.md`. Model sonnet-5, effort xhigh.
- **Skills**: 84 local skills (1.2 GB, gstack v1.69 suite dominates) + 418 plugin skills from 6 marketplaces (superpowers, vercel, designer-skills ×34 plugins, karpathy, clay, mattpocock). All are listed in every session's system prompt.
- **MCP global**: context7, octarin, railway, canva, pencil, higgsfield, miro, browseros-neo, goldfish (`*` project scope). higgsfield/miro/railway currently unauthenticated.
- **Hooks**: gstack session/stop/question hooks + Octarin capture hooks on SessionStart/Read/Stop. SessionStart also injects the full superpowers intro + Octarin memory digest.
- **Browser tooling**: BrowserOS already installed as `browseros-neo` MCP (`http://127.0.0.1:9010/mcp`) — **endpoint dead at audit time** (connection refused). Chrome installed. gstack `browse`/`connect-chrome` skills present, unproven. Playwright installed only in nukualofa, unused for E2E.
- **Memory layers, overlapping**: Octarin (team memory, actively used and good), goldfish MCP, gstack context-save/restore, per-repo doc sprawl. Glimpse-era projects carry 401–437-line CLAUDE.md files; active workspaces have thin AGENTS.md (45–153 lines) instead.

## Proven failure modes (with evidence)

1. **Visual work is unverified and bleeds money.** Sessions: "Video & Scroll Animation Build" — 18.6 h, **$205**, ended *partial*; "Portfolio visual stabilization" — 9 h, $82; contrast/shader fixes done by measurement scripts instead of looking at the page. No session record shows the agent opening the running dev server in a browser.
2. **Re-orientation tax.** Repeated explore/"cartographer" sessions just to re-learn a repo: $19–$92 each, several per week on the same repos (portfolio ×3 on one day, roseau, nukualofa). Durable per-project context is not landing where the next session reads it.
3. **Doc sprawl instead of compact context.** 1,567 md files (san-diego), 1,927 (nukualofa), 2,278 (roseau); nukualofa audit counted 66k lines of docs. Agents write handoffs/deliverables that later sessions can't find or afford to read.
4. **Outreach ops fragility.** Live incidents in session logs: priority-queue throughput collapse, stale email content sent to recipients, missed send window (hygiene agent killed, "brakes" not lifted), 187 corrupted queue entries. Debugged reactively in-session each time; no monitoring/validation loop.
5. **Instruction overload.** ~500 skills advertised per session plus 39 plugins plus multi-hook SessionStart injection. Directly matches the "agent has too many instructions" failure class; most designer-skills/clay/hyperframes/ios-* skills have zero appearances in 3 months of session history.
6. **Installed-but-dead tooling.** browseros-neo MCP configured but not running; higgsfield/miro/railway MCPs unauthenticated; goldfish scoped to every project with no observed use. Each costs context and adds failure surface.

## Workflow Baseline

| Area | Current State | Proven Gap | Impact | Priority |
| --- | --- | --- | --- | --- |
| Browser/UI verification | BrowserOS MCP installed but dead; Playwright installed in 1 repo, unconfigured; gstack browse skills unproven | Agent ships visual/animation work blind; longest, costliest, partial-status sessions are all visual | $205 + $82 single sessions; rework loops | **P0** |
| Durable project context | Thin AGENTS.md in active repos; knowledge scattered across 1.5k–2.3k md files each; Octarin works but per-repo orientation still re-done | Repeated paid re-exploration of same repos | $19–$92 per re-orientation, several/week | **P0** |
| Instruction/context load | 84 local + 418 plugin skills, 9 MCP servers, 3 hook families, all always-on | Skill list + MCP schemas consume context in every session; ~90% never used | Reliability + context pressure every session | **P1** |
| Outreach/automation safety | Kill-switch flags + cutover scripts exist; no monitoring loop, no pre-send validation harness | 4 live incidents in 2 weeks (queue collapse, stale content, missed window, corrupted entries) | Real emails to real recipients; reputational | **P1** |
| Production web quality | vitest + typecheck + lint only; no CWV/a11y/responsive checks in any pipeline | A11y/contrast/responsive issues found manually, hours-long sessions | Slow QA, quality escapes to Vercel prod | **P2** |
| Testing loops (unit) | vitest (TS) and pytest (Python) present and green | None — this works | — | keep |
| Team memory (Octarin) | Active, hooks capture sessions, memories resurface | Works; underused for per-repo orientation | — | keep |
| Dead/unauthenticated tooling | browseros-neo down; higgsfield/miro/railway unauthenticated; goldfish unused | Config debt, context cost, false capability claims | Minor but constant | P2 |

No solutions recommended yet, per Phase 1 rules.
