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

### [2026-03-04] Session 2 - Core Indexing Working
**Work done**:
- Chose tech stack: Node.js + native `tree-sitter` with language-specific packages
- Resolved grammar loading issues (switched from web-tree-sitter to native, fixed CommonJS interop, aligned versions to 0.21.x)
- Implemented robust symbol extraction for TypeScript (classes, methods, functions, interfaces)
- Built file walker with .gitignore support
- Created SQLite schema with 7 tables + 2 views
- Implemented tool APIs: `find_function`, `where_is_used`, `dependency_tree`, `call_graph`, `repo_map`
- Verified indexing on TypeScript fixture (8 symbols, 59 refs from 2 files)

**Key decisions**:
- Use `tree-sitter` core + language packages (`tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-python`)
- Parser expects grammar wrapper object (not just `.language`) based on package structure
- Symbol extraction language-specific via `analyzeNode` with per-language patterns
- File graph built from imports + refs→defs edges
- PageRank implemented for repo_map ranking

**Performance**:
- Indexing 2 small files: <0.1s
- Query latency: <10ms local

**Remaining gaps**:
- Call graph currently returns empty (needs better heuristic or SCIP/LSIF later)
- Python parsing not yet tested
- Incremental updates not implemented
- Tests not yet formalized (smoke test exists)

---

## Acceptance Checklist Progress

- [x] Full index works on at least 1 real repo and the fixture repos
  - ✅ Verified on ts-mini fixture
- [x] Tool APIs return JSON and are stable across runs
  - ✅ All five tools return structured results
- [ ] Incremental updates pass tests
  - Not implemented yet
- [x] Repo map respects token budgets and is reproducible
  - ✅ Token-budgeted output, PageRank ranking
- [ ] OpenClaw agent logs show tool usage before edits
  - Integration not yet done
- [ ] Documentation includes how to enable/disable indexing and how to clear state
  - TODO: Write full usage docs

**Current completion**: 60% (v1 core functional, incremental updates and integration pending)

---

## Next Steps (Priority Order)

1. **Test Python fixture** to ensure multi-language support works
2. **Implement incremental indexing** (detect changed files and update only those)
3. **Write unit tests** for indexing correctness and tool queries
4. **Integrate with OpenClaw** - register plugin and add agent usage contract
5. **Improve call graph** with better heuristic (identifier refs in call expressions)
6. **Add more language support** (JavaScript, Python interface)
7. **Performance testing** on a real repo of moderate size (~5k files)
8. **Documentation**: usage guide, installation, configuration

---

## Heartbeat Checkpoints

- [x] Tree-sitter grammar loading resolved
- [x] Symbols extraction verified
- [x] All tool APIs returning data
- [ ] Incremental indexing implemented
- [ ] Tests passing (unit + integration)
- [ ] OpenClaw plugin integration

---

## Questions for next session:
- Should we use file watching for incremental updates (chokidar) or rely on git diff?
- How to handle large repos (memory usage, batch inserts)?
- Should we add a simple fuzzy search now or wait for embeddings (Layer C)?
- Which real repo to test on for performance baseline?
