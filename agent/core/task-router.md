# Task Router

Read this when the route for a prompt is not obvious from the CLAUDE.md routing kernel. Skill details: `docs/agent-harness/skill-inventory.md`. Principle: **minimum sufficient set** — a simple task stays simple; loading an unneeded skill is a routing error.

## Depth ladder

| Depth | Shape | Use for |
| --- | --- | --- |
| **D1 Quick** | inspect → edit → validate | Trivial, reversible, ≤~3 files, unambiguous |
| **D2 Standard** | (spec if vague) → plan → build → validate → review-once | Meaningful bounded work |
| **D3 Deep** | interview/research → /spec → /plan → **approval gate** → /build auto → /code-review → /simplify | Large, ambiguous, costly, or multi-module |
| **D4 High-risk** | audit → plan → **explicit confirmation** → smallest step → verify → review; state rollback first | Any high-risk trigger (below) |

## Category matrix

| # | Category | Depth | Required | Optional | Excluded by default | Validation | Confirm? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Small code change | D1 | — (karpathy ambient) | — | spec/plan machinery | typecheck/test; sight loop if visual | No |
| 2 | UI / frontend feature | D2 | /spec (lite) → /plan → /build; **sight loop** | impeccable *or* ui-ux-pro-max, shadcn, accessibility-audit | hyperframes, design-shotgun | /verify-ui both viewports + odiff + tests | No |
| 3 | Perf / mobile optimization | D2+audit | optimizing-web-performance; sight loop; `npx lighthouse` before/after | chrome-devtools recipe (deep only, never resident) | generic design skills | measured before/after; keep-or-revert | No |
| 4 | Bug investigation | D1→D2 | diagnosing-bugs (app) / investigate (env) | context7, next-devtools MCP | spec/plan machinery | repro before fix; regression test after | No |
| 5 | Large feature / architecture | D3 | interview-me (if vague) → /spec → /plan → /build auto → /code-review | research; api-and-interface-design (contracts); observability (live systems); /simplify | everything else | full suite + sight loop if UI | **Yes** — plan approval |
| 6 | Repo cleanup / refactor | D2 | audit → classify → /plan; careful | /simplify, health | spec | full test suite green | **Yes** — before any deletion |
| 7 | Research / strategic decision | D2, no code | research *or* agent-reach (platform-named); concrete-answers for the report | context7, watch, make-pdf | ALL engineering skills | sources cited; a recommendation, not an option list | No |
| 8 | Automation / browser workflow | D2–D4 | browserclaw/BrowserOS (outreach-scoped); automation module (verify-send) | scrape, wizard, observability | dev-loop browser tools | Mailpit dry-run pass before ANY live send | **Yes** — anything that sends/posts |
| 9 | Planning / personal productivity | D1–D2, no code | — (plain reasoning) | planning-and-task-breakdown, make-pdf, diagram | ALL engineering skills | readable user-facing artifact | No |
| 10 | High-risk change | D4 | audit + careful; deprecation-and-migration (schema); wizard (creds) | observability | autonomy of any kind | staged verify + stated rollback | **Yes — always, before execution** |

## High-risk triggers (any one ⇒ D4, regardless of surface category)

Production deploy · migration on live data · auth / payments / credentials · live sends or outward posting · bulk deletion · anything `git revert` cannot undo. (Generalizes the gate already in `/build auto` step 6 to pre-execution.)

## Mid-task escalation / simplification

- D1 scope grows past ~3 files → stop, propose D2.
- Two failed fix attempts → switch to the formal diagnosing-bugs loop.
- A high-risk trigger appears → stop, confirm before continuing.
- A loaded skill is adding ceremony without value → drop it and say so.
- Required tooling missing (no tests, no dev server, no browser) → flag before working around.

## Execution banner (before acting; 2–4 lines, no internal reasoning, no skill dump)

> **Workflow:** <category> (D<n>)
> **Stages:** <arrow chain>
> **Validation:** <what proves it worked>
> **Decision needed:** <None | the single question>

D1 tasks: one line is enough — `**Workflow:** quick edit — will typecheck + verify visually.`

## Aliases & settled collisions (do not relitigate)

| You see / recall | Route to |
| --- | --- |
| writing-plan / writing-plans | `/plan` |
| executing-plans | `/build auto` |
| brainstorming | interview-me |
| subagent-driven-development | **rejected pattern — never use** |
| `/spec` | spec-driven-development — never gstack `spec` |
| review (default) | `/code-review` once pre-merge — not gstack `review`, not mattpocock `code-review` |
| tdd | test-driven-development (installed core) |
| browse (gstack) | call the daemon binary from bash — never load the 27k-token skill |

## Worked examples

| Prompt | Category | Route |
| --- | --- | --- |
| "Change one sentence on the landing page" | 1 / D1 | edit → typecheck → /verify-ui → done |
| "Create a new portfolio Connect page" | 2 / D2 | spec-lite → /plan → /build → sight loop → /code-review |
| "Fix mobile animation performance and CWV" | 3 / D2+audit | lighthouse+trace baseline → optimizing-web-performance → fix → re-measure → sight loop |
| "Debug this deployment" | 4 / D2 | investigate (env archaeology) → repro → fix → regression test |
| "Build an outreach automation workflow" | 5+8 / D3 | research → /spec (api-and-interface-design on contracts) → /plan → **gate** → /build auto → observability → /code-review; live sends stay D4 |
| "Clean up unused files and oversized docs" | 6 / D2 | audit → classify (keep/archive/delete) → **confirm deletions** → execute → tests green |
| "Research whether GEO or AI automations" | 7 / D2-no-code | research (cited) → decision framework → concrete-answers recommendation |
| "Deploy a database migration to production" | 10 / D4 | audit → plan → **explicit confirmation** → deprecation-and-migration pattern → staged verify → rollback stated |
| "Create a 12-week study plan" | 9 / D1–D2 | plain reasoning → structured plan artifact; zero engineering skills |
