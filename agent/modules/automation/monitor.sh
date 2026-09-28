#!/usr/bin/env bash
# Cron: */15 * * * * — read-only queue health + dead-man ping + urgent push. $1 = repo path.
# Env (from ~/.config/outreach/monitor.env, NOT in repo): HC_URL, NTFY_TOPIC
set -uo pipefail
source "$HOME/.config/outreach/monitor.env"
cd "$1"
claude -p "Read-only check, do not modify anything: inspect the outreach queue state (queue-status scripts or Supabase queue tables via existing read scripts) and last send log. Respond with ONLY a JSON object, no prose, no code fences: {queue_depth, oldest_pending_hours, sends_last_24h, failures_last_24h, stale_content_risk, verdict: \"ok\"|\"warn\"|\"critical\", reason}. If you cannot verify queue state with the tools allowed, verdict must be \"warn\" with the reason." \
  --allowedTools "Read,Grep,Glob,Bash(node scripts/*status*),Bash(npm run batch:report)" \
  --output-format json > /tmp/queue-health-envelope.json
# claude -p wraps the answer: the model's JSON lives in .result (possibly fenced) — extract it.
jq -r '.result // empty' /tmp/queue-health-envelope.json 2>/dev/null > /tmp/queue-health-result.txt
if jq -e . /tmp/queue-health-result.txt >/dev/null 2>&1; then
  cp /tmp/queue-health-result.txt /tmp/queue-health.json
else
  sed -n '/```json/,/```/p' /tmp/queue-health-result.txt | sed '1d;$d' > /tmp/queue-health.json
fi
verdict=$(jq -r '.verdict // empty' /tmp/queue-health.json 2>/dev/null)
[ -z "$verdict" ] && verdict=critical && echo '{"verdict":"critical","reason":"monitor could not parse queue-health output"}' > /tmp/queue-health.json
curl -fsS -m 10 "$HC_URL" -d "verdict=$verdict" >/dev/null || true   # dead-man: silence = alert
if [ "$verdict" = "critical" ]; then
  curl -fsS -m 10 -H "Priority: urgent" -H "Title: Outreach CRITICAL" \
    -d "$(jq -c '{verdict,reason,queue_depth}' /tmp/queue-health.json)" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null || true
fi
