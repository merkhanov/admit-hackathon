# Octarin memory export — taken 2026-08-31, immediately before full Octarin removal
# 25 most recent org memories (solo-relevant ones only matter; team items kept for reference).
# The harness decision record itself is fully duplicated in docs/agent-harness/decision-log.md + tool-evaluation.md.

## Own-work memories worth keeping (distilled)
- [decision] Harness: agent-skills framework + evidence-selected minimal stack (full body lives in decision-log.md + tool-evaluation.md — canonical local copy)
- [decision] Promoted api-and-interface-design + observability-and-instrumentation; validation of impact still pending
- [gotcha] Tool-integration bias: vendor hooks baked into CLAUDE.md before comparative evaluation create structural path dependency — defer wiring until measurement-validated
- [antipattern] Framework selection without session-profile alignment (32% exploration profile vs build-centric defaults) — profile alignment is a gate
- [verified_pattern] 18-topic context-engineering map (docs/agent-harness/context-engineering-topics.md) is the reusable RAG-decision reference
- [runbook] SSH idle timeout during long campaign monitoring: restart keepalive / use tmux for extended observation
- [runbook] Engagement drop isolation: A/B identical reply blocks at peak vs off-peak before blaming content
- [gotcha] Declare done only after end-to-end browser testing of ALL features (build passing ≠ features working) — recurs across 3D viewer sessions
- [verified_pattern] GLB/Sketchfab via Three.js: assets in public/, GLBLoader, license check FIRST, keyboard fallback controls for WCAG

## Team/other memories (reference only, from teammates' sessions)
- T2bio cold-start scaffold reads users.description live (app/style/prompting.py:352)
- YRYS logobook: editorial case-study system; mono core + green/brass accents; Figma font fallback (clone Neue Montreal, write in Geist)
- Финмодель: ёмкость команды должна ограничивать выручку (MIN от очереди и ёмкости в часах)
- Google Drive MCP create_file портит base64 >17K символов — бинарники не слать инлайном
- Primer wedge = dosage MVP, not Diamond Age day one
- Restart host after bundled browser plugin refresh (Codex nodePath manifest error)
