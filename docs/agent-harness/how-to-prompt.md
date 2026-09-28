# How to Prompt Normally

Since 2026-08-31 the harness routes skills automatically (`~/.claude/CLAUDE.md` kernel + `agent/core/task-router.md`). What that means for you:

1. **Just describe the task.** "Optimize the mobile portfolio", "debug this deployment", "research X" — no skill names needed. The agent classifies the task, picks the shallowest sufficient depth (D1 quick / D2 standard / D3 deep / D4 high-risk), and shows a 2–4-line banner before acting.
2. **Read the banner.** It's your cheap correction point — if the workflow or "Decision needed" line is wrong, say so before work starts.
3. **Slash commands still work** and skip classification: `/spec`, `/plan`, `/build [auto]`, `/verify-ui`, `/code-review`, `/wrap-session`. Use them when you already know the route.
4. **High-risk asks will always stop for confirmation** (prod deploys, live-data migrations, auth/payments/credentials, live sends, bulk deletion). That's by design — approve explicitly.
5. **To force depth**, say it: "quick fix, no plan" pins D1; "plan this properly" pins D3.
6. **Old skill names are aliased** — "writing-plan", "executing-plans", "brainstorming" resolve to the installed equivalents automatically.
7. **If routing misfires**, quote the banner in your correction; recurring misroutes are one-line fixes in `agent/core/task-router.md`.
