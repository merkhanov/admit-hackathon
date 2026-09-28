# Claude Code Operating Principles — Phase 2

Source: Boris Cherny (Claude Code creator), "Practical Tips on How to use Claude Code" (Code w/ Claude, May 2025 talk; YouTube M8HuXu_bOco) + official docs behavior + local evidence from `workflow-baseline.md`. Each principle is kept only if it changes a setup decision for this environment.

## 1. The feedback loop is the multiplier, not the toolset

Cherny: "give it some sort of tool that it can use to check its work, and it will iterate by itself... a mock gets pretty good on one shot; with 2–3 iterations against screenshots it gets almost perfect." Anthropic's own apps repo ships a checked-in Puppeteer MCP precisely for screenshot-iterate loops.

**Applies here:** this is the exact missing piece behind the $205/18.6h partial animation session and the 9h contrast session. The harness must give the agent *sight* of the rendered dev server (screenshot/console/network), not more instructions about visual quality. Decision driver for Phase 3: pick the browser tool that makes screenshot-iterate cheapest and most reliable, nothing broader.

## 2. Small tool surface; the model composes

Claude Code itself ships few tools (edit, bash, search) and no system-prompt choreography — "the model is good; tell it to use git and it knows how." Bash CLIs taught via `--help` are a first-class integration path, often better than an MCP server.

**Applies here:** 9 MCP servers + ~500 advertised skills invert this principle. Prefer: existing project CLIs (`npm run campaign`, `geo:*` scripts, cutover-doctor) documented in one line each, over new MCP servers. Every candidate integration in Phase 3 must beat the "just a bash CLI + one CLAUDE.md line" alternative.

## 3. Context files: short, checked-in, hierarchical, pulled on demand

CLAUDE.md is injected into the first user turn of *every* session — "keep it as short as you can; too long just uses up context and is usually not that useful." Nested CLAUDE.mds load only when working in that directory. Shared project context is the highest-leverage starting point ("write once, whole team benefits"); `.mcp.json` checked into the repo distributes tooling.

**Applies here:** active repos (san-diego 153-line AGENTS.md, nukualofa 45-line) are already closer to correct than the older 400+-line files. The re-orientation tax ($19–$92/session) is a *missing compact orientation layer* problem, not a missing archive problem — 1.5k–2.3k md files per repo prove archives don't get read. Rule: one short root file (what/where/commands/gotchas) + nested files for subsystems (outreach engine, scrapers) + Octarin for cross-session decisions. Never a doc dump.

## 4. Plan before code; codebase Q&A before plan

"Before you write code, make a plan" needs no special tooling. Q&A (including git-history archaeology) is the cheapest orientation mechanism and teaches where the one-shot boundary is.

**Applies here:** already partially practiced (superpowers brainstorm/writing-plans). The gap is that orientation output evaporates — Q&A findings from a $90 explore session must land in the root context file or Octarin, or the next session pays again. Definition-of-done for any explore session: durable context updated.

## 5. Permissions tuning is throughput

Allowlist the commands you approve repeatedly (project test/build/lint, safe CLIs); blocklist what must never run. Tiered: project vs user vs managed.

**Applies here:** current allowlist is only `mcp__octarin`, `mcp__pencil`. Every vitest/typecheck/dev-server run pays a prompt or dangerous-mode. For outreach repos this is also the *safety* seam: allowlist dry-run/status commands, keep live-send commands behind approval — directly addresses the kill-switch/missed-window incident class.

## 6. Headless mode (`claude -p`) is the automation primitive

"A super-intelligent Unix utility — pipe logs in, get JSON out. We use it in CI, incident response, pipelines."

**Applies here:** the outreach incident class (queue collapse, stale content, corrupted entries) is a monitoring problem. A cron'd `claude -p` check over queue state/send logs with JSON output is the minimal fit — before considering any heavier automation framework in Phase 3.

## 7. Slash commands for repeated workflows

Repeated multi-step prompts become checked-in `.claude/commands` files (Anthropic auto-labels GitHub issues this way).

**Applies here:** candidates visible in session history: pre-send outreach checklist, dev-server-verify loop, "what shipped this week." Only create ones matching *observed* repetition; this is the on-demand alternative to permanently-loaded skills.

## 8. Parallelism via isolated checkouts is already solved here

Power users run parallel sessions via worktrees/multiple checkouts. Conductor already provides this (workspaces per branch). No additional parallelism tooling should be adopted.

## 9. Adding capability = adding context cost, permanently

Every always-on skill, MCP schema, and hook injection is paid in every session, whether used or not (~90% of the current 500 skills unused in 3 months). The lecture's model is the opposite: near-empty defaults, capability taught at point of use.

**Applies here:** Phase 3/4 default answer for any new integration is *reject or on-demand*; always-on requires evidence of near-daily use. Same test applies retroactively to the existing stack (designer-skills ×34, clay, hyperframes, ios-*, dead browseros-neo endpoint, unauthenticated MCPs, goldfish).
