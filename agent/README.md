# Agent Harness

Minimal Claude Code harness. Core is always-on and tiny; modules are copied into a project only when applicable.

- `core/` — orientation template, doc-index generator, global slash commands, framework masters (agent-skills selective copy)
- `modules/web-development/` — browser verification (Playwright + odiff), scoped MCP template, perf-debug recipes
- `modules/automation/` — Mailpit verify-before-send, dead-man monitor, permissions/secrets hardening
- `modules/research/` — evidence cards, source register (templates only, no tooling)
- `templates/` — new-project bootstrap files

Activation: `docs/agent-harness/new-project-bootstrap.md`. Decisions + evidence: `docs/agent-harness/decision-log.md`. Full evaluation: `docs/agent-harness/tool-evaluation.md`.
