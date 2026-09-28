# Staged Transition Plan: Claude Code subscription → lower-cost modular stack

Date: 2026-08-31. Subscription ends: **2026-09-04**. Objective (user's framing): build a staged transition to a lower-cost, modular workflow; **preserve Claude Code until the alternative stack is tested on real tasks and shown reliable**. Evidence: five research reports (harness CLIs, OpenCode/Crush, models+costs, frameworks+terminal, Conductor), all 2026-08-31, primary-source verified.

## The central insight

**Claude Code the CLI is free software; what ends Sep 4 is flat-rate access to Anthropic models.** Conductor is free and runs in API-key mode. DeepSeek, GLM, Kimi, and MiniMax all expose **Anthropic-compatible endpoints** documented to work inside Claude Code. Therefore Stage 1 is not a harness migration at all — it is a model-endpoint swap inside the harness you already validated. Harness migration (OpenCode) is the hedge; pi+cmux is the deep restructure, held in reserve.

## Layer verdicts

| Layer | Verdict | Basis |
| --- | --- | --- |
| Harness, Stage 1 | **Keep Claude Code** (free CLI) on cheap Anthropic-compat endpoints | Zero porting cost; whole harness survives untouched |
| Harness, Stage 2 hedge | **OpenCode** (anomalyco, MIT, ~202k⭐) | Reads `~/.claude/skills` + `CLAUDE.md` as-is; permissions FINER than Claude Code (glob bash rules, `.env` read-deny by default); headless `run --format json`; 75+ providers BYO-key. Gaps: `.claude/commands` needs one-time copy; fast-churn risk (5.6k open issues) |
| Harness, Stage 3 option | **pi** + cmux | Best-verified codebase, best session model (branching trees), 25+ providers incl. DeepSeek/Kimi/GLM/LM Studio; skills port ZERO-edit (`{"skills": ["~/.claude/skills"]}`); bus factor moderate-good (5+ regular committers, 99.6k⭐). Cost: NO built-in permissions — a Claude-parity allow/ask/deny extension is ~150–300 lines TS / ~1 day (shipped examples `permission-gate.ts` + `protected-paths.ts` prove the hook); and no Conductor (→ cmux) |
| Rejected harnesses | Crush (pre-1.0, FSL, no JSON headless, coarse permissions), Aider (maintenance mode since Aug 2025), Gemini CLI as primary (Google-models-only; keep as free-tier volume tool — 1,000 req/day), Qwen Code (free tier dead Apr 2026; fine as spare BYO-endpoint CLI), Cline CLI 2.0 (solid runner-up; revisit if OpenCode churn bites), Codex CLI (closest CC feel + OS sandbox, but GPT-tuned and ChatGPT-sub-oriented) | — |
| Models | **DeepSeek V4-Pro** primary / **V4-Flash** grunt / **Kimi K2.6-K2.7** fallback for long-horizon / **GLM Pro $72 flat** if bill certainty preferred | Cost 5–15× under Claude; V4 weakness = repo-scale reliability + hallucinations (test in Stage 0) |
| Model routing, privacy | Outreach repos (san-diego, nukualofa) → **US-hosted V4** (OpenRouter→DeepInfra, ~2.5–5× direct price, still ≪ Claude); everything else → DeepSeek direct. NOTE: your working hours = DeepSeek peak (2× rates); batch jobs off-peak/weekends | DeepSeek ToS soft-permits training, CN jurisdiction |
| Local inference | **Support crew only**: gpt-oss-20b or Qwen3-8B in LM Studio (installed) for autocomplete/commit messages/offline/privacy grunt. NO agentic multi-file work | 16 GB cap: 30B-class doesn't fit; ~12–30 tok/s realistic |
| Terminal/workspaces | **Keep Conductor** (free, API-key mode) through Stages 1–2. Stage 3 only: cmux (first-class pi hooks) + worktrunk/gwq for worktrees. Vibe Kanban = agent-agnostic backup | Conductor supports exactly 4 harnesses; no pi, no custom CLIs |
| Agentic frameworks | None replaces Claude Code (that question is category error). For BUILDING the outreach product: **Vercel AI SDK 6 `ToolLoopAgent`** (TS stack). LangGraph only for durable multi-day state. AutoGen dead (maintenance mode Oct 2025) | — |
| Behavioral layer | **ponytail** (adopted; adapters for 14+ agents → ports to every stage) | Token-reduction aligned with cost goal |
| External workflows | **Contacts app / RNS: preserved unchanged** (user rule; no evidence for change) | — |

## Asset portability table

| Harness asset | Stage 1 (Claude Code + cheap endpoint) | Stage 2 (OpenCode) | Stage 3 (pi) |
| --- | --- | --- | --- |
| agent-skills 7 SKILL.md dirs + ponytail + accessibility-audit | unchanged | **load as-is** from `~/.claude/skills` | **zero-edit port** — pi implements the Agent Skills standard and its settings can point straight at `~/.claude/skills`; skills also register as `/skill:name` commands |
| /spec /plan /build /verify-ui /wrap-session commands | unchanged | one-time copy to `~/.config/opencode/commands/` (same `$ARGUMENTS` idiom) | prompt-templates equivalent; rework |
| Global CLAUDE.md (SDLC loop, ponytail line) | unchanged | **read natively** (CLAUDE.md fallback) | port to pi context file |
| verify-ui.mjs / visual-diff.sh / Mailpit verify-send / imap-verify / mempalace / graphify | unchanged — plain bash+CLIs, harness-independent | unchanged | unchanged |
| monitor.sh (`claude -p … --output-format json`) | unchanged (claude CLI billed via DeepSeek endpoint env) | swap to `opencode run --format json` + adjust parsing (event stream, not single object) | `pi --mode json --tools <list>` — JSONL event stream, ~1 h of jq rework (`select(.type=="message_end")`); `--mode rpc` is strictly richer for monitor loops |
| Permissions (allow/ask/deny incl. `.env` deny — live-send safety seam) | unchanged | port to opencode.json — **richer** (glob bash rules; `.env` deny is default) | ~1-day custom extension via the `tool_call` block hook (mutable input, `{block: true}`; runs in ALL modes incl. headless); must gate `read` too; keep Mailpit as the authoritative send gate; Docker/Gondolin micro-VM documented for hard boundaries |
| Conductor workspaces | unchanged | unchanged (native OpenCode support since v0.69) | LOST → cmux + worktrunk/gwq |
| gstack/vercel/mattpocock plugin skills + hooks | unchanged | skills in `~/.claude/skills` load; **plugin-cache skills + all hooks/MCP wiring do NOT** — treat as Claude-Code-only | lost; rebuild selectively |
| MemPalace capture hooks | unchanged | UNVERIFIED whether OpenCode fires compatible Stop hooks — fallback: cron `mempalace mine` | same fallback |

## Stages

### Stage 0 — before Sep 4 (subscription still live): test, don't migrate
1. Get a DeepSeek API key (+$10 credit) and an OpenRouter key.
2. **The decisive A/B** (~1–2 h): in a Conductor workspace, set `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` + `ANTHROPIC_API_KEY=<deepseek key>` (Settings → Environment) and run the same two real tasks on Claude and on V4-Pro: (a) a multi-file Next.js refactor in nukualofa, (b) one outreach change in san-diego (dry-run only). Score: invented APIs/files, plot-loss after ~20 tool calls, /verify-ui pass, tokens/cost. Known caveats via this endpoint: no MCP passthrough, `budget_tokens` ignored.
3. Same tasks once on **Kimi K2.7-Code** (Anthropic-compat) — the long-horizon fallback candidate.
4. Install OpenCode (`brew install anomalyco/tap/opencode` or curl script), point at DeepSeek, run task (a) once. Copy the 5 command files. Verify skills auto-load and `.env` deny fires.
5. Decision gate: if V4-Pro passes → Stage 1 primary = DeepSeek. If it hallucinates badly → GLM Pro plan ($72 flat) or Kimi becomes primary. If Claude quality proves irreplaceable for hard work → budget a small Anthropic API key for the hardest 5–10% (Sonnet 5 API ≈ $33–165/mo at light-medium partial use).

### Stage 1 — Sep 4: model swap, zero harness change
- Claude Code + Conductor stay. Global env (or per-workspace): DeepSeek Anthropic-compat as default; **outreach repos get OpenRouter→US-host V4 keys instead** (privacy).
- monitor.sh cron: switch its env to V4-Flash off-peak; verify one cycle end-to-end (hc-ping + ntfy).
- LM Studio: pull gpt-oss-20b for offline/grunt.
- Expected cost: **$70–230/mo** (GLM-flat vs DeepSeek-metered, heavy usage) vs ~$1,240 Claude-API-equivalent.

### Stage 2 — Sep 5–15: prove the harness hedge in parallel
- Run OpenCode for ≥5 real sessions (one per task type: feature via /spec→/plan→/build, incident, exploration, outreach dry-run, /verify-ui loop). Same benchmark discipline as ever: correct/partial/wrong + cost.
- Port monitor.sh variant to `opencode run --format json` (keep the claude-CLI version as fallback).
- Decision gate: OpenCode ≥ Claude-Code-on-DeepSeek on those sessions → it becomes primary and the last Anthropic dependency is optional. Worse → stay on Stage 1 indefinitely (nothing forces a harness change; the CLI is free).
- Also settle MemPalace hook compatibility (test one OpenCode session → `mempalace status`; else install the cron fallback).

### Stage 3 — only if wanted later: pi + cmux restructure
Preconditions before ANY adoption: write and test a bash-gating pi extension (the permission seam), accept losing Conductor (→ cmux + worktrunk), accept the moderate bus factor (5+ regulars). Re-evaluate pi's skill compat at that time. No date; triggered by need (extension programmability, session branching), not by the subscription.

## Rollback & risks
- Every stage is reversible: Stage 1 rollback = restore env vars (or buy one month of subscription); Stage 2 rollback = keep using Claude Code CLI.
- Top risks: (1) V4 repo-scale hallucinations — mitigated by Stage 0 test + Kimi/GLM fallback + optional small Anthropic API budget for hard tasks; (2) OpenCode churn — mitigated by Stage 1 being fully viable indefinitely; (3) DeepSeek peak-hour 2× — mitigated by GLM flat plan or off-peak batching; (4) Anthropic could later restrict third-party endpoints in Claude Code — mitigated by Stage 2 hedge existing.

## Sep 1–4 checklist (Stage 0, ~half a day total)
- [ ] Sep 1: DeepSeek + OpenRouter keys; A/B task (a) Claude vs V4-Pro; score sheet in `.context/eval/model-ab/`
- [ ] Sep 2: A/B task (b) outreach dry-run (US-host V4); Kimi run; pick primary model
- [ ] Sep 3: install OpenCode, copy commands, verify skills + `.env` deny + one real task; port-test monitor.sh env swap
- [ ] Sep 4: flip Conductor env defaults (Stage 1 live); LM Studio gpt-oss-20b pulled; record decision in decision-log.md
