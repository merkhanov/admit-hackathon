# Retrieval Benchmark — question set (topic D2)

Purpose: decide the memory/retrieval layer (status quo+ vs MemPalace vs Graphify) on measured performance instead of priors. Every question comes from a real past session and has a verifiable ground-truth answer in a repo, its git history, or its docs.

Method: for each candidate system, ask each question in a fresh `claude -p` session in the named repo (same model, same allowedTools baseline + the candidate's access path). Score: correct / partial / wrong (against ground truth), tokens spent, wall time. A candidate must beat status quo+ on correctness first, cost second.

## Questions

| # | Repo | Question | Ground truth anchor |
| --- | --- | --- | --- |
| 1 | nukualofa | Where is the outreach kill-switch logic and how is it lifted for a live batch? | env/config flags + send-path code |
| 2 | nukualofa | Why was the WhatsApp BSP-coexistence decision (D2) reversed, and what replaced it? | Aug 11 review session; decision docs (€49/mo elimination, direct Meta Cloud API) |
| 3 | nukualofa/san-diego | What does migration 061 fix, and what does it deliberately NOT fix? | migration 061 + autopilot-store.ts + commit d6eb3db message |
| 4 | san-diego | Why are stuck `outreach_autopilot_send` rows intentionally not marked `failed`? | migration 061 rationale in its own text |
| 5 | nukualofa | What is the PECR gate, and why did UK company-number matching miss its 52% target? | gate code + Aug 20 session (5.5% display-rate finding) |
| 6 | san-diego | What is the real daily send capacity vs the release cap, and where is each defined? | mailbox pool (75/day) vs release cap (300/day) config |
| 7 | san-diego | What caused the priority-queue throughput collapse and where was it fixed? | Aug 25 fix session; queue code |
| 8 | san-diego | What caused the stale-email-content incident and what now prevents a recurrence? | incident session + Mailpit verify-before-send gate |
| 9 | san-diego | Which npm scripts are dry-run-safe vs live-send, per the permissions seam? | package.json + .claude/settings.json ask/allow lists |
| 10 | roseau | What was the IOAI newsroom opportunity-parsing bug and how was it fixed? | Aug 22 data-quality session; parser + its test |
| 11 | nukualofa | Which core Tally-playbook GEO claims were disproved, and by what evidence? | Aug 22 GEO strategy validation session artifacts |
| 12 | nukualofa | What does scripts/cutover-doctor.ts check, and when should it run? | the script itself + outreach engine docs |
| 13 | san-diego (portfolio) | Which font substituted Neue Montreal for the RU locale and why that one? | Aug 26 localization session (metric-matched, Cyrillic subset) |
| 14 | san-diego (portfolio) | What were the mobile-rendering bottlenecks in the GSAP/Lenis/OGL stack? | mobile-performance docs branch, PR #1 |
| 15 | nukualofa | Where is the banned-ICP-token guard in the landing copy tests and what does it block? | copy test guard ('2gis' token, Aug 10 session) |

## Candidate configurations

- **Status quo+**: orientation file (if present) + `.context/DOC-INDEX.md` + native Grep/Glob/Read + git log. No extra tools.
- **MemPalace**: minimal viable setup per the 2026-08-31 reverification (mined over the repo + transcripts first; query path as recommended at HEAD).
- **Graphify**: graph built fresh on the repo per the 2026-08-31 reverification (query path as supported at HEAD).

## Scoring sheet (fill per run)

| # | System | Verdict (correct/partial/wrong) | Output tokens | Wall time | Notes |
| --- | --- | --- | --- | --- | --- |
