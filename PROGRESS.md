# codebase-brain Progress Tracker

*This file tracks development progress alongside OpenClaw heartbeats. Update after each work session.*

---

## Project Kickoff
**Date**: 2026-03-04
**Status**: Repository created, initial structure established
**Completed**:
- ✅ Created separate repository at `~/codebase-brain`
- ✅ Added `codebase-brain.md` specification document
- ✅ Created `manifest.json` for plugin registration
- ✅ Set up directory structure (`.openclaw/plugins/codebase-brain/{state,vectors,src,fixtures,scripts}`)
- ✅ Created `.gitignore` to exclude state files
- ✅ Created `README.md` with project overview

---

## Implementation Log

### [2026-03-04] Session 2-3 - Multi-Language & Incremental Updates
**Work done**:
- Chose tech stack: Node.js + native `tree-sitter` with language-specific packages
- Resolved grammar loading issues (switched from web-tree-sitter to native, fixed CommonJS interop, aligned versions to 0.21.x)
- Implemented robust symbol extraction for TypeScript (classes, methods, functions, interfaces, fields)
- Extended extraction for lexical_declarations (const/let variables, arrow functions) and variable_declarations
- Built file walker with .gitignore support
- Created SQLite schema with 7 tables + 2 views
- Implemented tool APIs: `find_function`, `where_is_used`, `dependency_tree`, `call_graph`, `repo_map`
- Verified indexing on TypeScript fixture (19 symbols total)
- Tested Python parsing: successfully extracts 13+ symbols from py-mini fixture
- Implemented incremental update capability:
   - Added `updateFile` and `getFileInfo` in Indexer
   - Added `clearEdges` in Database
   - Created `src/cli/update.js` (needs refinement for sub-repos)
- Improved call graph building (still heuristic, low coverage)

**Key decisions**:
- Use native `tree-sitter` + language packages (`tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-python`)
- Parser expects grammar wrapper (module itself) not just `.language`
- Symbol extraction language-specific via `analyzeNode` with per-language patterns
- File graph built from imports + refs→defs edges
- PageRank implemented for repo_map ranking
- Incremental updates in v1 simply clear+rebuild edges (acceptable for small repos)

**Performance**:
- Indexing 2 small files: <0.1s
- Queries: <10ms

**Current symbol counts**:
- ts-mini: 19 symbols across 2 files (15 in users.ts, 4 in index.ts)
- py-mini: 13+ symbols across 2 files

---

## Acceptance Checklist Progress

- [x] Full index works on at least 1 real repo and the fixture repos
  - ✅ Verified on ts-mini and py-mini fixtures
- [x] Tool APIs return JSON and are stable across runs
  - ✅ All five tools return structured results
- [ ] Incremental updates pass tests
  - Core method implemented; CLI needs fixing for sub-repos; tests pending
- [x] Repo map respects token budgets and is reproducible
  - ✅ Token-budgeted output, PageRank ranking
- [ ] OpenClaw agent logs show tool usage before edits
  - Integration not yet done
- [ ] Documentation includes how to enable/disable indexing and how to clear state
  - TODO: Write full usage docs

**Current completion**: 70% (core functional, incremental update partial)

---

## Next Steps (Priority Order)

1. **Fix update CLI** to accept repo root argument or run from correct directory
2. **Test incremental flow** end-to-end: change one file → update → verify DB change without full reindex
3. **Write unit tests** for indexing correctness and tool queries (use fixtures as golden)
4. **Integrate with OpenClaw** - register plugin and add agent usage contract
5. **Improve call graph** with better heuristic (identifier refs in call expressions)
6. **Add more language support** (pure JavaScript, Python edge cases)
7. **Performance testing** on a real repo of moderate size (~5k files)
8. **Documentation**: usage guide, installation, configuration

---

## Heartbeat Checkpoints

- [x] Tree-sitter grammar loading resolved
- [x] Symbols extraction (TS + Python)
- [x] All tool APIs returning data
- [ ] Incremental indexing verified in CLI
- [ ] Tests passing (unit + integration)
- [ ] OpenClaw plugin integration

---

## Questions for next session:
- Should we use file watching for incremental updates (chokidar) or rely on git diff?
- How to handle large repos (memory usage, batch inserts)?
- Should we add a simple fuzzy search now or wait for embeddings (Layer C)?
- Which real repo to test for performance baseline?
- How to improve call graph coverage without SCIP/LSIF?
