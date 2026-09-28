# Automation / Outreach Module

Activate for repos with senders, queues, or scrapers (san-diego, nukualofa-class projects). Every piece maps to a real 2026-08 incident (see `docs/agent-harness/tool-evaluation.md` Round 2).

## Verify-before-send (prevents: stale content to real recipients)

Setup once: `curl -sL https://github.com/axllent/mailpit/releases/latest/download/mailpit-darwin-arm64.tar.gz | tar xz -C ~/.local/bin mailpit` (single 20MB binary; a working copy also sits in `.context/eval/mailpit-poc/`).

Flow, gating every live batch:
1. `MP_ENABLE_SPAMASSASSIN=postmark ~/.local/bin/mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025 &` (localhost only)
2. Point the sender at `127.0.0.1:1025` in dry-run mode and send the REAL rendered campaign email.
3. `node verify-send.mjs` — fetches it back via the REST API and asserts recipient, exact subject, campaign headers, **no unreplaced `{{vars}}`**, lead name present, offer date current. Exit 0 `OK_TO_SEND` / exit 1 `BLOCK_LIVE_SEND`.
4. Optional advisory: `GET /api/v1/message/{ID}/sa-check` returns a SpamAssassin score with per-rule fixes. Advisory only — content goes to Postmark's hosted checker (no SLA) and cannot see IP/domain reputation. Never gate on it.
5. Live send is allowed only after step 3 exits 0, and still goes through the permissions `ask` list.

## Monitoring (prevents: missed send window, silent queue collapse)

`monitor.sh <repo>` on cron `*/15 * * * *`:
- `claude -p` read-only queue-health check → JSON verdict
- healthchecks.io dead-man ping (create a free check with the cron schedule + grace period; if the machine, cron, or claude dies, the MISSING ping alerts)
- `critical` verdict → urgent push via ntfy.sh (the topic name is the credential — generate an unguessable one; add hc→ntfy integration so one phone app gets both)

Config lives in `~/.config/outreach/monitor.env` (`HC_URL`, `NTFY_TOPIC`) — never in the repo.

## Post-send ground truth (prevents: "queue says sent" lies)

`node imap-batch-verify.mjs` after each batch: confirms every batch Message-ID exists in the Sent folder, sweeps INBOX for bounces since batch start → `CRITICAL_MISSING_SENDS` / `WARN_HIGH_BOUNCE` / `OK` with exit code. Use read-only mailbox credentials, never the send key.

## Scraper resilience (prevents: live-site drift breaking prod flows)

Pattern, no tool: (a) vitest fixtures — saved HTML/JSON + zod schema assertions on extractor output (catches parsing regressions); (b) a live canary — 1 real request per scraper per monitor cycle, zod-validate the extracted shape, soft-fail to ntfy (catches drift, which fixtures structurally cannot).

## Secrets

- Copy `permissions-template.json` into the repo's `.claude/settings.json` (adjust script names to its package.json). The `deny` list covers Bash reads (`cat .env`) — a Read-only deny is bypassable. Verify in a live session: `cat .env` must be blocked.
- Prod send-keys live OUTSIDE the repo tree (`~/.config/outreach/prod.env`), injected via `node --env-file=...` only in the live-send commands that already sit in the `ask` list.
