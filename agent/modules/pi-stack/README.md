# pi + cmux stack (adopted 2026-08-31)

Installed: pi 0.84.4 (`~/.local/bin/pi`, npm user-prefix), cmux 0.64.22 (brew cask + CLI), worktrunk `wt` 0.75.0.

Wiring:
- `~/.pi/agent/settings.json` → `{"skills": ["~/.claude/skills"]}` — all harness skills (agent-skills core, ponytail, accessibility-audit, gstack-resident) load zero-edit and register as `/skill:name`.
- `~/.pi/agent/prompts/{spec,plan,build,verify-ui,wrap-session}.md` — command files ported (frontmatter: description; `$ARGUMENTS` works).
- `~/.pi/agent/extensions/permissions.ts` — the allow/ask/deny port (master copy here). DENY: .env reads via read tool AND bash, sudo, recursive deletes outside workspace tree. ASK (interactive) / BLOCK (headless): go-live, campaign, cutover, outreach:run, --send/--live, force-push, hard reset, prod env injection. Mailpit verify-send remains the authoritative send gate.
- `~/.pi/agent/extensions/cmux-session.ts` — cmux hooks (session restore via `pi --session`, feed telemetry, workspace naming).

First-launch checklist (user):
1. `pi` → `/login` with chosen provider(s) per the subscription decision (Max OAuth and/or ZAI_API_KEY / MINIMAX_API_KEY / DEEPSEEK_API_KEY).
2. If using Max OAuth: after the first session, check the Claude usage dashboard — usage must hit PLAN quota, not extra-usage billing (policy pause verification).
3. Launch cmux.app once → Settings → disable anonymous telemetry (Sentry/PostHog default ON).
4. Extension smoke test in a scratch dir: ask pi to `cat .env` (expect block) and to run `npm run go-live` (expect ask/block).
5. Parallel worktrees: `wt` (worktrunk) creates them; cmux tabs host the pi sessions.

monitor.sh port (when leaving claude CLI): `pi --mode json --tools read,grep,ls,bash "prompt" | jq -c 'select(.type=="message_end")'` — headless mode auto-blocks all ask-tier commands via the extension.
