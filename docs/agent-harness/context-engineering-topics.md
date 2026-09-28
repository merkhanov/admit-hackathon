# Context Engineering & RAG — the exact topics to cover

Purpose: give you enough understanding to co-decide the retrieval architecture of the harness. Ordered so each topic builds on the previous; each carries the decision question it unlocks. Your own evidence (MemPalace/Graphify PoCs, the 3%-outline benchmark, the $19–92 re-orientation sessions) is referenced throughout — you already ran the experiments; these topics explain what they mean.

## Block A — How context actually works (foundation, no RAG yet)

**A1. Context window vs attention budget.** A model can *hold* 200k+ tokens but does not *attend* to them equally; middle-of-context content is recalled worst ("lost in the middle"). Decision unlocked: why 500 always-on skill descriptions degraded quality even when unused, and why "just put everything in context" is not a strategy.

**A2. The token economics of always-on vs on-demand.** Every MCP schema, skill description, and hook injection is paid in every session; invoked content is paid once when used. You measured this: MemPalace 44 schemas vs Mailpit's 2 REST endpoints. Decision unlocked: the budget line any retrieval system must beat.

**A3. Claude Code's context layering.** The exact load order and cost of: system prompt → CLAUDE.md hierarchy (enterprise/user/project/nested) → skill descriptions → command expansion → MCP schemas → tool results. Decision unlocked: *where* retrieved knowledge should enter (a file the model Reads beats a schema the model carries).

**A4. Progressive disclosure.** The pattern your harness already uses: a 30-token description always-on, the 5k-token body loaded on invocation. Skills ARE a retrieval system — keyed by the model's own judgment instead of embeddings. Decision unlocked: when a "new RAG tool" is actually just a skill/file layout problem.

## Block B — Retrieval fundamentals (what RAG is)

**B1. The RAG loop itself.** Retrieve → augment → generate: an index is built offline, a query pulls the top-k chunks, they're pasted into context. Decision unlocked: RAG is a *cache with a ranking function* — it wins only when the corpus can't fit and the ranking is good.

**B2. Chunking.** Fixed-size vs semantic (heading/function boundaries) vs document-level; overlap; why chunk quality dominates everything downstream. Your MemPalace PoC failed here: it "chunked" at whole-file level, so retrieval returned entire files. Decision unlocked: whether any candidate tool's chunking fits markdown-heavy repos.

**B3. Embeddings and vector similarity.** What an embedding encodes (topical similarity), what it doesn't (exact identifiers, code symbols, negation, recency). Your PoC hit: correct file ranked #1 with cosine 0.02 — near-noise scores can still rank correctly, which is why score thresholds mislead. Decision unlocked: reading any vector tool's claims critically.

**B4. Lexical search (grep/BM25) vs semantic vs hybrid.** Exact-term search wins on code/identifiers/paths; semantic wins on paraphrase ("why does CORS break" → GOTCHAS.md); hybrid = both + merge. Decision unlocked: for code repos, Claude Code's native Grep/Glob is already a strong lexical retriever — the gap, if any, is only on prose.

**B5. Retrieval quality: precision/recall@k, reranking.** How to tell good retrieval from bad: of the top-k chunks, how many are relevant (precision), and did the needed one appear at all (recall). Rerankers re-order candidates with a stronger model. Decision unlocked: how to test any candidate on your own corpus in an afternoon instead of trusting a README.

**B6. Index freshness and maintenance cost.** An index is a second copy of the truth; it rots. Your Graphify graph: built April, never rebuilt, never queried — the canonical failure. Decision unlocked: any adopted index needs an owner (a cron, a hook, or a human) or it will lie.

## Block C — The alternatives that aren't vector RAG

**C1. Agentic retrieval (Claude Code's native model).** No index at all: the agent greps, globs, reads, follows imports — ranking happens in the model's head, freshness is perfect by construction. Boris Cherny's stated design: "we don't do any indexing." Decision unlocked: the null hypothesis every RAG proposal must beat; for repos under ~1M tokens of *relevant* text it usually wins.

**C2. Summarization hierarchies (your 3% baseline).** Tiered compression: path index (~5k tokens) → H1–H3 outline (~3% of corpus) → full docs on demand. Zero LLM cost to rebuild, trivially fresh, readable by any session. This is what beat Graphify on your own 66k-line corpus. Decision unlocked: how far tiering scales before real retrieval is needed.

**C3. Knowledge graphs / GraphRAG.** Entities + typed edges + community summaries; answers *multi-hop* questions ("what depends on the thing that writes this table?") that similarity search can't. Costs: full-corpus ingest per build, an engine to query it, freshness. Decision unlocked: the narrow case where Graphify-class tools genuinely pay — large *unfamiliar* codebases, relationship-shaped questions — and why your familiar, doc-heavy repos aren't it.

**C4. Memory taxonomy: episodic / semantic / procedural.** Episodic = what happened (Octarin session capture); semantic = distilled facts and decisions (Octarin memories, orientation file); procedural = how to do things (skills). Write-path vs read-path: capture is cheap, *distillation* is the bottleneck — your /wrap-session is the distillation step both MemPalace and Graphify lacked. Decision unlocked: naming which memory type a proposed tool serves, and spotting when it duplicates one you have.

**C5. Context compaction and session continuity.** How long sessions survive: summarize-and-continue, handoff docs, orientation reload. Decision unlocked: whether "losing context mid-session" (a compaction issue) is being misdiagnosed as "we need RAG" (a corpus issue) — they need different fixes.

## Block D — The decision itself

**D1. When RAG earns its place — the four thresholds.** (1) Corpus: relevant text no longer fits agentic exploration (~1M+ tokens actually needed, not just present); (2) query frequency: the same corpus is asked often enough to amortize the index; (3) staleness tolerance: answers survive a stale index; (4) ranking beats grep: queries are paraphrase-shaped, not identifier-shaped. Decision unlocked: a checklist — if any threshold fails, the answer is Block C, not RAG.

**D2. Evaluating on your own workload.** Build a 10–20 question set from real past sessions ("where is the kill-switch logic?", "why did we reject BSP for WhatsApp?"), measure tokens-to-correct-answer and wall time for: status quo vs candidate. You already have the money metric: the $19–92 re-orientation session. Decision unlocked: an evidence-based adopt/reject, same method as the rest of the harness.

**D3. Security of retrieved content.** Anything retrieved into context is an injection surface (the Supabase MCP docs name this for DB rows; same holds for scraped pages and old docs). Decision unlocked: trust rules for whatever pipeline is chosen.

**D4. The candidate architectures for THIS harness.** The actual menu, with the evidence that would pick each:
- **(a) Status quo+** — orientation file + doc index + Octarin + agentic grep. Wins unless a D1 threshold is crossed. Currently crossed? No repo has shown it yet.
- **(b) Local hybrid search CLI over prose** — a bash-invoked BM25+embedding index of docs/ and .context/, rebuilt by cron, zero MCP schemas. The minimal real-RAG step if paraphrase queries over the 1.5–2.3k-md-file archives prove frequent.
- **(c) One-shot GraphRAG for an unfamiliar codebase** — build, read the ~5k-token report, discard. Break-glass tool, not infrastructure.
- **(d) Resident memory MCP (MemPalace-class)** — requires disproving A2 economics that killed it once. The bar: a measured win on D2 that (a) and (b) both fail.

## Suggested path through it

Read order A1→A4, B1→B6, C1→C5, D1→D4 (each topic is 15–30 min of study). Or: I run a research pass per block against primary sources and produce a teaching doc with your repos as the worked examples; or we use the mattpocock `teach` skill for a multi-session structured version. After Block D you'll be able to pick (a)–(d) yourself — and the honest prior from all evidence so far is (a), with (b) as the first thing worth testing.
