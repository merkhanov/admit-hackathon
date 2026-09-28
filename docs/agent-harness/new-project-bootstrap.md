# New Project Bootstrap

How a fresh project becomes productive in one session. Harness root: `~/conductor/workspaces/coding-set-up/stuttgart` (referred to as `$HARNESS`).

## First session, in order

1. **Orientation file**: `cp $HARNESS/agent/templates/CLAUDE.md ./CLAUDE.md`. Fill it *during* the first codebase-Q&A pass (ask Claude to explore and answer; write conclusions straight into the file). Hard cap 150 lines — orientation output must land durably, or the next session pays to rediscover it.
2. **Doc index**: `bash $HARNESS/agent/core/gen-doc-index.sh .` → `.context/DOC-INDEX.md`.
3. **Permissions**: `mkdir -p .claude && cp $HARNESS/agent/templates/settings.json .claude/settings.json` (adjust script names to this project's package.json).
4. **If web UI**: `npm i -D playwright`; note the sight-loop rule + `/verify-ui` in the CLAUDE.md commands section. If Next+Supabase: `cp $HARNESS/agent/templates/mcp-template.json .mcp.json`, fill `<DEV_PROJECT_REF>`, export a dev-project `SUPABASE_ACCESS_TOKEN`.
5. **If automation/outreach**: copy what applies from `$HARNESS/agent/modules/automation/` (verify-send, monitor, permissions incl. deny rules); secrets outside the repo tree per its README.
6. **Define the work**: `/spec` → `/plan` → `/build` (or `/build auto` after approving the plan). One approval gate; no per-task re-review. `/code-review` once, pre-merge.
7. **End the session**: `/wrap-session` — durable findings fold into CLAUDE.md, decisions into Octarin.

## Definition of done for session 1

- CLAUDE.md is real (not template placeholders), under 150 lines
- `.context/DOC-INDEX.md` exists
- Web projects: one passing `/verify-ui` run with artifacts in `.context/verify/`

## Module activation summary

| Situation | Do |
| --- | --- |
| Rendered UI | web-development module (sight loop mandatory for visual changes) |
| Senders/queues/scrapers | automation module (verify-before-send gates live sends) |
| Multi-session research | research module (evidence cards; findings graduate at /wrap-session) |
| Perf deep-dive | on-demand chrome-devtools MCP recipe (web module README) — never resident |
| A11y pass | `accessibility-audit` skill |
| Anything else | core only — do not preload capability |
