#!/usr/bin/env bash
# Harness bootstrap for a new/existing project. Run from the project root:
#   bash ~/harness/bootstrap.sh [--web] [--automation]
# Idempotent: never overwrites existing files.
set -euo pipefail
H="$(cd "$(dirname "$0")" && pwd)"
[ -f CLAUDE.md ] || [ -f AGENTS.md ] || { cp "$H/agent/templates/CLAUDE.md" ./CLAUDE.md; echo "+ CLAUDE.md (orientation template — fill during first Q&A session, 150-line cap)"; }
mkdir -p .claude
[ -f .claude/settings.json ] || { cp "$H/agent/templates/settings.json" .claude/settings.json; echo "+ .claude/settings.json (permissions starter — adjust script names)"; }
bash "$H/agent/core/gen-doc-index.sh" . >/dev/null && echo "+ .context/DOC-INDEX.md"
if [ "${1:-}" = "--web" ] || [ "${2:-}" = "--web" ]; then
  grep -q '"playwright"' package.json 2>/dev/null || echo "! run: npm i -D playwright   (sight loop prerequisite)"
  [ -f .mcp.json ] || { cp "$H/agent/templates/mcp-template.json" .mcp.json; echo "+ .mcp.json (fill <DEV_PROJECT_REF>, export SUPABASE_ACCESS_TOKEN)"; }
  echo "  sight loop: node $H/agent/modules/web-development/verify-ui.mjs http://localhost:<port>"
fi
if [ "${1:-}" = "--automation" ] || [ "${2:-}" = "--automation" ]; then
  echo "! automation module: copy what applies from $H/agent/modules/automation/ (verify-send gate, monitor, permissions deny rules); secrets OUTSIDE the repo tree"
fi
echo "done. First session: /spec -> /plan -> /build; end with /wrap-session. Guide: $H/docs/agent-harness/new-project-bootstrap.md"
