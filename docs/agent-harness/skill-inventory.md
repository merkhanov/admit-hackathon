# Skill Inventory — Routing Working Set

Date: 2026-08-31. Companion to `agent/core/task-router.md`. Scores cited for agent-skills / mattpocock entries come from `framework-comparison.md` (DAILY 0–10, already evidence-scored — not re-litigated here). Every installed skill costs ~30 always-on tokens (description line); **Cost** below is on-invoke.

## Tier A — the router's working set

| Skill | Purpose | Best trigger | Required inputs | Expected output | Cost | Risks / when NOT to use |
| --- | --- | --- | --- | --- | --- | --- |
| `/spec` (spec-driven-development, 6) | Structured spec before code; capability map for multi-module work | New feature/system with vague or multi-module requirements | The ask + access to repo | `SPEC.md` | ~4k | Trivial/well-specified changes; NOT gstack `spec` |
| `/plan` (planning-and-task-breakdown, 6) | Dependency-ordered tasks + acceptance criteria | Work too large to start; before `/build auto`; any "make me a plan" ask | Spec or clear requirements | `tasks/plan.md`, `tasks/todo.md` | ~3k | Single-slice tasks |
| `/build` / `/build auto` (incremental-implementation 7 + test-driven-development 6) | RED→GREEN per slice, per-task commits, single approval gate | Implementing from spec/plan | Approved plan, clean baseline | Committed, tested slices | ~5k | Non-code work; exploratory spikes |
| interview-me (6) | One-question-at-a-time to ~95% intent confidence | Underspecified ask ("build X" without for-whom/why-now) | The vague ask | Clarified requirements | ~2k | Pure information requests (refuses by design) |
| `/code-review` (built-in) | Verified findings on diff/PR | Once, pre-merge | A diff | Findings list | native | Per-task re-review (rejected pattern) |
| `/simplify` (built-in) | Reuse/simplification cleanup, applies fixes | After a large feature lands | A diff | Applied cleanups | native | As a bug hunt |
| `/verify-ui` + `visual-diff.sh` | Screenshots 1440/390 + console/network; odiff mask | **Mandatory** for any rendered-UI change | Running dev server | `.context/verify/` artifacts, pass/fail | ~0 (bash) | Non-visual changes |
| `/wrap-session` | Distill findings → orientation file + `docs/decisions.md` (Octarin removed 2026-08-31) | Session end after durable learning | Session context | Updated CLAUDE.md + decision rows | ~0 | — |
| diagnosing-bugs (mattpocock, 7) | Repro-loop-first debugging → regression test | Production incidents; non-obvious app bugs | Failing behavior | Root cause + regression test | ~4k | Obvious one-line fixes |
| investigate (gstack) | Root-cause archaeology in env/config/tooling | "Works locally, breaks deployed"; env failures | Symptom | Diagnosis | med | App-logic bugs → diagnosing-bugs |
| research (mattpocock, 6) | Primary-source investigation, cited claims | Feasibility/API/market research where sourcing matters | Question | Cited md file in repo | ~2k+run | Quick lookups (context7 / web search) |
| agent-reach | Platform-routed internet research (15 platforms) | Research naming a platform (Reddit, X, YouTube, LinkedIn, xhs…) or a URL | Topic/URL | Fetched content | med | General web questions; content post-processing |
| wizard (mattpocock, 6) | Interactive bash walkthrough for creds/env/dashboards | Third-party service onboarding, secrets wiring | Service to set up | Guided script, filled .env | ~3k | — |
| api-and-interface-design (6) | Contract-first design; idempotency/retry/DLQ protocol | Queue/API contract changes (outreach send paths) | Contract surface | Design + contracts | ~4k | UI-only work |
| observability-and-instrumentation (6) | On-call-question-driven logs/metrics/alerts | Shipping features on the live outreach system | The feature | Instrumentation | ~4k | Throwaway scripts |
| accessibility-audit | Lighthouse/axe WCAG 2.2 pass | A11y pass on web UI; pre-launch | Running app or src | Issue list + fixes | ~4–6k | — |
| optimizing-web-performance | Mobile-first CWV/jank diagnosis | Perf complaints; Lighthouse regressions; slow animations | Running app | Measured findings | ~4k | Non-web perf (break-glass: agent-skills clone) |
| chrome-devtools MCP (recipe) | Perf traces, CPU/net throttling, heap snapshots | Deep perf sessions only | Temp `--mcp-config` launch | Traces | 7.4k resident | Never leave resident |
| browserclaw / BrowserOS | Real logged-in browser actions | Outreach/scraping ops needing live sessions | Running BrowserOS app | Actions performed | 5.4k schema | Dev-loop verification (sight loop owns it) |
| careful / guard (gstack) | Destructive-command guardrails | High-risk tasks; cleanup with deletions | — | Blocked/warned commands | small | — |
| writing-for-agents (mattpocock, 6) | Skill/CLAUDE.md authoring reference | Editing the harness itself | Target doc | Better harness docs | ~3k | — |
| concrete-answers | Strips hedging; recommendation-first format | Research/strategy deliverables; "just tell me" | Draft answer | Direct answer | small | — |
| karpathy-guidelines | Surgical-change behavioral layer | Always-on via CLAUDE.md — router never loads it explicitly | — | — | ~0 | — |
| context7-mcp | Current library/framework docs | Any library/API syntax, config, migration question | Library + question | Current docs | per-query | Business-logic debugging |

## Tier B — situational seats (explicit need, named platform, or scheduled hygiene)

| Skill | Seat / trigger |
| --- | --- |
| ship (gstack) / vercel:deploy | Ship path; always behind the D4 high-risk gate for production |
| qa / qa-only (gstack) | Whole-app QA sweep when the sight loop's single-page check isn't enough |
| health, retro (gstack) | Periodic repo/process hygiene, user-initiated |
| prototype (mattpocock, 5) | One design question answered with throwaway code |
| resolving-merge-conflicts (mattpocock, 5) | In-progress merge/rebase conflicts |
| domain-modeling / codebase-design (mattpocock, 4) | Vocabulary drift; module-boundary reasoning |
| impeccable / ui-ux-pro-max / shadcn / dataviz | Design-heavy UI work — pick **one** per task, never stack |
| make-pdf, diagram | Output formatting on explicit ask |
| watch | Video URL as research input |
| scrape / skillify (gstack) | Structured data pulls; codifying a repeated scrape |
| use-railway / vercel:* family | Infra work naming the platform |
| claude-api | Any Anthropic/LLM API work (its own trigger rules apply) |
| deprecation-and-migration, security-and-hardening | Break-glass from `.context/eval/agent-skills/skills/` for live-schema migrations / deliberate security passes (D4) |
| learn, humanizer, x-reply, interview variants | Niche, explicit-ask only |

## Tier C — excluded from routing (load only on explicit user ask)

| Group | Members | Why excluded |
| --- | --- | --- |
| Video/media production | hyperframes ×7, general-video, media-use, remotion-to-hyperframes, Higgsfield MCP | Zero overlap with measured task profile; explicit "make a video" only |
| iOS family | ios-clean/design-review/fix/qa/sync, ios-* | No iOS work in 3 months of history |
| gstack ceremony layer | autoplan, plan-{ceo,design,devex,eng}-review, office-hours, cso, benchmark-models, codex, landing-report, pair-agent, design-{shotgun,consultation,html}, spec (gstack) | Duplicates the adopted loop or serves rejected workflows; gstack `spec` is a live collision hazard with `/spec` |
| Duplicate seats, loser declared | mattpocock tdd/code-review/grilling/to-spec/to-tickets/implement; gstack research; gstack `browse` SKILL (binary only — 27k tokens) | Framework-comparison winners installed; browse decision-log row |
| Setup one-shots | setup-*, sync-gbrain, gstack-upgrade, find-skills, freeze/unfreeze, connect-chrome, open-gstack-browser | User-initiated by nature |
| Removed/unused capture layers | goldfish, screenpipe-api/cli | Removed or zero observed use (decision log 2026-08-26) |
