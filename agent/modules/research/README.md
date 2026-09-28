# Research Module

Activate only for multi-session research or large-document work. Templates only — retrieval/graph tooling was evaluated and rejected with evidence (tool-evaluation.md: MemPalace, Graphify).

Rules:
- Findings graduate into the project orientation file or Octarin (`memory_record_decision`) at `/wrap-session` — never accumulate as loose files (the 2,278-file lesson).
- Every number in an evidence card carries its source inline; unverifiable claims are marked "unverified" or dropped.
- One evidence card per claim cluster; one source register per project.

## Break-glass: orienting in unfamiliar code (Graphify)

For an inherited/undocumented codebase or a large dependency — NOT for repos that already have an orientation file:

```bash
# one-time, in a venv or uv tool install graphify-cli; then:
graphify extract <path/to/src> --code-only --out .context/graphify   # ~8s on a 300-file TS app, no LLM
graphify cluster-only --out .context/graphify
# read .context/graphify/graphify-out/GRAPH_REPORT.md (~4k tokens: cycles, god nodes, subsystem bridges)
graphify query "<question>" --graph .context/graphify/graphify-out/graph.json --budget 2000   # 0.2s, serverless
```

No resident MCP server (10 tools ≈ 2–2.5k tokens — skip it). Findings worth keeping graduate into the orientation file, then the graph output can be deleted.

## Session-history search (MemPalace, CLI-only)

Capture is automatic: global Stop/SessionEnd hooks silently mine every Claude Code transcript into the local palace (~/.mempalace). Zero always-on context cost — the 45-tool MCP server is deliberately NOT registered.

- Find exact words from a past session: `mempalace search "<query>" --results 5` (hybrid semantic+BM25; add `--wing <name>` to scope)
- Backfill a project's history once: `mempalace mine ~/.claude/projects/<project-dir> --mode convos`
- This is an ARCHIVE (verbatim chunks by design). Distilled knowledge lives in the orientation file + docs/decisions.md via /wrap-session — never treat search hits as decision records.
