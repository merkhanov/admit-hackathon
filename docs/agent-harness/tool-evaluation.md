# Repository Evaluation Matrix — Phase 3

Date: 2026-08-26. Method: every repo shallow-cloned into `.context/eval/` and inspected at code level; PoCs run against real projects (nukualofa dev server, nukualofa `src/`, glimpse `graphify-out/`); prior first-party evidence (2026-08-21 Graphify session) incorporated. No global config was modified.

## Matrix

| Repo | What it actually is (from code) | Gap addressed | PoC result | Context cost | Security | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| **BrowserOS** (browseros-ai) | Chromium fork + Rust MCP server compiled into the app; server exists only while app runs (this explains the "dead" 127.0.0.1:9010 — config was correct all along; installed v0.0.44 verified live with 20 tools) | Secondary (logged-in automation) | Launched app → MCP alive, `tools/list` returned 20 tools; no dedicated console/network tool | ~5.4k tokens of schema per session | Localhost-only; nonce-wrapped untrusted content; agent inherits signed-in sessions by design; anonymous telemetry | **Optional** — keep config, scope to outreach/scraping sessions only; wrong tool for the dev loop |
| **browser-harness** (browser-use) | NOT a benchmark: alpha Python CLI/daemon that attaches to the real daily Chrome via CDP remote debugging; ships as an 8.5KB skill; PostHog telemetry (opt-out); paid-cloud upsell in skill text | Secondary only | Not run live (would require enabling remote debugging on daily Chrome — declined on security grounds) | ~2.1k tokens skill | **High**: remote debugging exposes every logged-in session to any local process | **Reject** for dev verification; revisit for outreach only with a dedicated automation Chrome profile |
| **Plain Playwright via bash** (baseline, already installed) | User's own devDependency (1.62.1) + cached Chromium, driven by a 40-line script | **P0 dev-verification loop** | **Pass**: real nukualofa dev server; 1440px+390px full-page screenshots + console/network capture in 6.2s; caught a real `<Image>` aspect-ratio defect; artifacts in `.context/eval/poc/` | ~0 (no schema; script read on demand) | Headless, localhost, no credentials | **Adopt** — promote `shot.mjs` to a per-project `verify` script |
| **gstack `browse` daemon** (already installed) | Persistent headless Playwright daemon (63MB binary, ~100ms/cmd, goto/screenshot/console/network/click/fill/responsive) buried under a 1,081-line / ~27k-token SKILL.md that is ~80% telemetry/upsell boilerplate | P0 interactive click/fill | Binary + commands verified by inspection | 27k tokens if loaded as skill; ~0 if binary called from bash | Local daemon | **Adapt** — call the binary directly from bash; never load the skill |
| **web-quality-skills** (addyosmani) | 6 skills + references; concrete, tool-invoking (Lighthouse/axe), measurement-disciplined ("do not claim LCP failing without runtime evidence"); WCAG 2.2 coverage | P2 (a11y/CWV — nothing in the current ~500 skills invokes Lighthouse/axe) | **Pass**: `accessibility` dry-run on nukualofa `src/` found 4 real unfixed WCAG issues in ~10 min (no form labels repo-wide, focus-invisible submit, SSR `lang="en"` on /ru pages, no skip link) — on a codebase that already ate a 9h manual a11y session | ~30 tokens always-on (description line); 4–6k on invocation | Clean | **Adapt** — adopt `accessibility` skill; copy only `INP.md`+`CLS.md` refs into existing `optimizing-web-performance`; reject the other 4 skills (superseded by user's own) |
| **agent-skills** (addyosmani) | 24-skill general SDLC methodology pack; well-written but ~90% duplicates superpowers + mattpocock + gstack already installed | None unmet | Checked against installed stack skill-by-skill | ~800 tokens/session always-on if adopted | Clean | **Reject** — keep only its untrusted-browser-content security policy as input to browser workflow docs |
| **andrej-karpathy-skills** (multica-ai; installed via forrestchang fork) | 1 skill, 67 lines, purely behavioral; byte-identical to the installed plugin | None | Every section duplicated by superpowers:brainstorming, verification-before-completion, `careful` | Plugin overhead every session | Clean | **Reject — remove installed plugin** (pending approval; recent failures were domain-knowledge failures, not discipline failures) |
| **MemPalace** | 47.5k-LOC local ChromaDB memory store; regex miner files project files *verbatim*; 44 MCP tools; a Stop hook that blocks Claude from stopping every 15 messages to force saves | None (P0 context gap is distillation, not retrieval) | Ran fully locally on toy corpus: retrieval correct but returns whole source files back — an archive re-stored in a vector DB | 44 tool schemas/session (five figures of tokens) + forced save turns | Fully local, telemetry silenced, MIT — clean | **Reject** — a second archive plus a large context tax; its one compact artifact (`wake-up`, <1k tokens) is a degraded machine version of a hand-curated root context file |
| **Graphify** | tree-sitter code→NetworkX graph + 10-tool MCP; markdown extraction still test-only at today's HEAD (confirms user's 2026-08-21 finding); docs pass runs inside the host Claude session (cost invisible to its own ledger) | None for docs-heavy repos | Decisive: user's own April run on glimpse (`graphify-out/`) — 517 nodes, mixed quality (cohesion 0.06–0.39, one empty community), never rebuilt or queried in 4.5 months; aged into an unread archive. No-tool baseline (H1–H3 outline = ~3% of corpus tokens; path+index ≈ 5k tokens) dominates on cost | `graph.json` ≈ 89k tokens (unreadable); report ≈ 5.5k; MCP server must stay running | Local, Apache-2.0 | **Reject** for these repos; optional someday for orienting in a large unfamiliar pure-code base; `extractors/markdown.py` (408 lines, self-contained) is vendorable if link-edges ever needed |

## Cross-cutting conclusions

1. **P0 browser gap closes with zero new tools.** Playwright + cached Chromium were already installed; the entire gap was a missing 40-line script and the habit of using it.
2. **P0 context gap closes with no tool.** Both memory candidates converge on producing a compact orientation artifact — which is exactly a hand-curated ~3–5k-token root context file plus a zero-LLM-cost generated path index (user's own 2026-08-21 benchmark: path+index ≈ 4.9k tokens on a 66k-line corpus). Capture already exists (Octarin); the missing piece is a session-end distillation habit.
3. **Net adoption from 7 repos: one skill + two reference files.** Everything else is reject/optional — consistent with the Phase 2 principle that always-on capability must earn near-daily use.

---

# Round 2 — gap-driven research (2026-08-26, post framework pivot)

User decisions incorporated: agent-skills becomes the main SDLC framework (supersedes Round 1 "reject", which assumed superpowers stayed); karpathy-guidelines stays. New mission: what Claude Code can't do out of the box for this user's actual work.

## Framework

| Item | Evidence | Decision |
| --- | --- | --- |
| agent-skills as main framework | `/build auto` has NO per-task review agent (test→code→suite→build→commit, one upfront approval gate) — the double-review the user rejected is structurally absent. Plugin install would cost ~3–4k always-on tokens (24 skills + 4 agents + SessionStart hook injecting 191-line meta-skill; no per-skill toggle exists in Claude Code plugins) | **Adopt via selective copy**: 5 skills (spec-driven-development, interview-me, planning-and-task-breakdown, incremental-implementation, test-driven-development) + 2 references + 3 commands (/spec /plan /build, edited to bare skill names, debugging routed to gstack `investigate`). 19 skills skipped with named duplicates |
| superpowers plugin | Only writing-plans/executing-plans used; replaced outright by /plan + /build auto | **Disable** (`enabledPlugins` boolean; rollback = one flip; cache untouched) |
| karpathy-guidelines | 67-line behavioral layer; auto-fires on coding; complements incremental-implementation outside /build | **Keep**; anchor via one CLAUDE.md line |

## Web dev (schema sizes measured live from tools/list)

| Tool | Measured | Unique capability vs owned stack | Decision |
| --- | --- | --- | --- |
| odiff (odiff-bin) | PoC on real screenshots: caught injected 8px shift + 18-step contrast change ("500 different pixels", 60ms); full 1440×15385 page diffed in 0.19s; clean exit codes (0/21/22); red diff-mask PNG readable by agent | Agent *sees what its edit changed* — before/after diff closes the blind-shipping loop | **Adopt** (bash; ~5 lines added to verify script) |
| next-devtools-mcp (Vercel official) | v0.4.0, 4 tools ≈ 1.6k tokens; proxies Next 16 `/_next/mcp` | Hydration + client runtime errors per route/session (never in terminal output), type errors sans build, on-demand route compile | **Adopt-scoped** (.mcp.json in Next repos only) |
| Supabase MCP (official) | v0.11.0; locked config `--read-only --project-ref --features=database,debugging` = 6 tools ≈ 1.5k tokens | query_logs (hosted logs, CLI can't reach), get_advisors (RLS/perf), passwordless read SQL. PAT is account-wide (flag ≠ boundary); prompt-injection via DB contents is the documented risk | **Adopt-scoped** (per-project, dev-project PAT) |
| chrome-devtools-mcp (Google) | v1.8.0, 29 tools ≈ 7.4k tokens; monthly cadence; telemetry on by default | Perf traces + CPU/network throttling + heap snapshots (mobile-perf + GSAP leak hunting) — nothing owned does this | **Adopt on-demand only** (temp --mcp-config during perf sessions; never resident) |
| playwright-mcp (Microsoft) | v1.63-alpha, 24 tools ≈ 5.3k tokens | None — the redundant subset, minus the perf trio | **Reject** |
| Design-to-code alternatives | 2026 landscape = SaaS wrappers around the same models | None vs pencil MCP | **Reject** |

## Automation/outreach (mapped to the 4 real incidents)

| Item | Evidence | Incident prevented | Decision |
| --- | --- | --- | --- |
| Mailpit verify-before-send | v1.31.0 (2026-08-22), 20MB binary, localhost-only; PoC end-to-end: real nodemailer→SMTP→REST fetch→content assertions; stale send → exit 1 BLOCK_LIVE_SEND. MailHog dead (last release 2020) | Stale content to real recipients; partially the 187 corrupted entries | **Adopt** |
| Spam scoring via `MP_ENABLE_SPAMASSASSIN=postmark` | Live PoC: score 0.8 with per-rule fixes in ~5s; content goes to Postmark hosted checker (no SLA); can't see IP/domain reputation | — (advisory only) | **Adapt** (env var on Mailpit; standalone SA/Rspamd rejected — no macOS arm64 path) |
| healthchecks.io + ntfy.sh around `claude -p` monitor | Native options verifiably can't: cloud `schedule` has no local access; PushNotification needs interactive pairing; nothing detects "cron never ran". ntfy PoC HTTP 200; hc dead-man free tier 20 checks | Missed send window; throughput collapse (surfaces within one cron cycle) | **Adopt** (~6 lines of cron) |
| imap-batch-verify.mjs | Template smoke-tested (imapflow already owned): Sent-folder ground truth + bounce sweep → JSON verdict | Missed send window (queue-says-sent vs actually-sent) | **Adapt** (template only) |
| Scraper contract tests | Polly.JS orphaned; fixtures freeze the past — the real incident was live-site drift | Scraper drift class | **Pattern only**: zod-schema fixture tests + tiny live canary via monitor |
| Secrets tooling (dotenvx/direnv) | direnv auto-exports secrets into every agent shell (worse); real gap is deny rules missing Bash patterns (`cat .env` bypasses Read deny) | — | **Reject tools**; harden config: deny Read+Bash on .env*, prod keys outside repo via --env-file in gated send path |

PoC artifacts: `.context/eval/harness-eval/` (schema dumps, diff images), `.context/eval/mailpit-poc/` (binary, verify-send.mjs, imap-batch-verify.mjs).

---

# Round 3 — MemPalace + Graphify re-verification at HEAD (2026-08-31)

Trigger: user corrections — the Graphify staleness argument was void (repo simply not worked on), and MemPalace churns fast enough that the Aug-26 findings warranted a re-check. Both re-tested at HEAD with live runs. **Two of our original findings were wrong; corrections owned below.**

## Corrections to Round 1

| Original finding | Status at re-verification | What we got wrong |
| --- | --- | --- |
| MemPalace "retrieval returns whole files" | **WRONG — and was wrong on Aug 26 too.** `chunk_text()` (~800 chars, 100 overlap) has shipped since v3.2.0. Live test: search returned a correct ~800-char chunk (cosine 0.398 / bm25 2.02) | Doc-based conclusion, not behavior-based |
| MemPalace "Stop hook blocks Claude every 15 messages" | **WRONG at HEAD, and already fixed pre-v3.8.0.** Recommended plugin registers NO hooks; the shipped hook is silent-by-default (opt-in verbose blocking only); clean opt-outs exist | We read `website/guide/hooks.md`, which still (incorrectly) documents blocking behavior |
| MemPalace "44 MCP tools" | **STANDS, +1 worse: 45 tools ≈ 7.7k tokens** (measured via live tools/list). Read-only mode: 24 tools ≈ 3.5k. No lean mode; CLI-only path viable (~0 tokens) but not the designed install | — |
| Graphify "markdown extraction test-only" | **WRONG (partly) even at v0.9.50** — production invoked it via a dispatch table our grep missed; at v0.9.53 it's unambiguous: deterministic .md extraction wired into update/watch, zero LLM | Grepped for direct callers only |
| Graphify build/query cost | **Now genuinely low:** 7.9s deterministic build on nukualofa src (302 TS/TSX files → 1,512 nodes/3,694 edges), free incremental updates, serverless `graphify query` in 0.22s with token budgets. Resident MCP (10 tools ≈ 2–2.5k tokens) fully avoidable | Cost objection withdrawn |

## New findings (live tests)

- **Graphify on nukualofa src/** surfaced three things orientation docs + grep don't: two real import cycles in `lib/engines/`, degree-ranked god nodes (`Copy` 41 edges, `cn()`, `whatsappHref()`…), cross-subsystem bridges (`OutreachLead` couples 7 modules; `marketForCity()` bridges audit→outreach). Report ≈ 3.8k tokens; the rest duplicates the existing passport/index. One-time findings, not per-session payoff.
- **MemPalace convo miner on 3 real transcripts (46–181KB):** stores raw verbatim message chunks by explicit design (repo CLAUDE.md: "We never summarize. We never paraphrase." — summarization PRs refused). A 118KB session yielded 6 drawers, all harness boilerplate ("Do not rename the current branch" filed under hall `identity`); zero work content survived. `wake-up` ≈ 777 tokens but content was boilerplate fragments. Retrieval over the archive is accurate — but returns conversation archaeology, not decisions. No repo-scoped auto-recall (manual `--wing` only).

## Revised verdicts

| Tool | Old verdict | New verdict |
| --- | --- | --- |
| Graphify | Reject | **Adopt as on-demand CLI, break-glass** — build-once + bash-query for unfamiliar/undocumented code (inherited repos, large dependencies, client code); zero resident cost. Marginal for the user's own documented repos |
| MemPalace | Reject | **Optional supplement, CLI-only** — local semantic+BM25 grep over past-session transcripts ("find the exact words from that session"), ~0 always-on tokens, no MCP server. **Cannot replace capture + decision recall**: constitutionally verbatim, no distillation, no decision records, capture demonstrably fills with boilerplate |
| Octarin replacement by MemPalace+Graphify | (question) | **Not viable** — neither tool stores "what we decided and why." If Octarin is removed (solo-dev call), the functional replacement is local decision-log files written by /wrap-session + native Claude Code memory, with MemPalace CLI as an optional transcript-search supplement |
