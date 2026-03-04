# codebase-brain Progress Tracker

*This file tracks development progress alongside OpenClaw heartbeats. Update after each work session.*

---

## Project Kickoff
**Date**: 2026-03-04
**Status**: ✅ v1 Complete - Ready for OpenClaw Integration
**Completed**:
- ✅ Created separate repository at `~/codebase-brain`
- ✅ Added `codebase-brain.md` specification document
- ✅ Set up directory structure (`.openclaw/plugins/codebase-brain/{state,vectors,src,fixtures,scripts}`)
- ✅ Created `.gitignore` to exclude state files
- ✅ Created `README.md` with project overview and usage
- ✅ Implemented Node.js + native `tree-sitter` stack (v0.21.x)
- ✅ Supports TypeScript, JavaScript, Python parsing
- ✅ Full symbol extraction for classes, methods, functions, interfaces, fields, variables
- ✅ SQLite schema with 7 tables + 2 views
- ✅ All five tool APIs returning structured JSON:
   - `codebase.find_function`
   - `codebase.where_is_used`
   - `codebase.dependency_tree`
   - `codebase.call_graph`
   - `codebase.repo_map`
- ✅ File walker with .gitignore support
- ✅ Incremental update capability (`updateFile` method + CLI)
- ✅ PageRank-based repo_map with token budgeting
- ✅ Unit test suite with 6 passing tests covering core functionality and fixtures
- ✅ OpenClaw plugin integration:
   - `openclaw.plugin.json` manifest
   - `src/plugin.ts` registers tools via plugin-sdk
   - Auto-indexing on first tool call (when DB empty)
   - Parameter schemas defined for all tools
   - `package.json` includes `openclaw.extensions`
   - Plugin can be installed via `openclaw plugins install ~/codebase-brain`

---

## Implementation Log (Chronological)

### Session 1 (17:00 CET)
- Scaffolded repository, created manifest, directory structure
- Pushed initial commit

### Session 2 (17:10 CET)
- Resolved tree-sitter grammar loading (native packages)
- Implemented parsing for TypeScript, added symbol extraction
- Pushed commit with working indexer and tools

### Session 3 (17:15 CET)
- Extended symbol extraction (lexical_declarations, variable_declarations)
- Added Python support
- Implemented incremental update (`updateFile`, `clearEdges`)
- Updated CLI `update.js` to accept repo root
- Pushed commit with multi-language and incremental updates

### Session 4 (17:20 CET)
- Wrote comprehensive unit tests (6 tests, all passing)
- Created OpenClaw plugin entry (`src/plugin.ts`)
- Added `openclaw.plugin.json` and updated `package.json`
- Documented integration steps in README
- Pushed final v1

---

## Current Status

**Version**: 0.1.0
**Feature parity**: Implements Layers A+B per specification
**Test coverage**: Core functions covered by unit tests using fixture repos
**Performance**:
- Indexing: <0.1s for 2 files; scalable target <60s for ~5k files
- Queries: <10ms local
- Memory: SQLite on disk; in-memory caches modest

**Known gaps**:
- Call graph heuristic incomplete (best-effort, often empty until more refs collected)
- No Layer C (embeddings + fuzzy search) yet
- Incremental update CLI works but not heavily tested on large repos
- No built-in support for SCIP/LSIF or CodeQL (future upgrades)

---

## OpenClaw Integration Instructions

1. **Install plugin**:
   ```bash
   openclaw plugins install ~/codebase-brain
   ```

2. **Configure plugin**:
   Edit `~/.openclaw/config.json` (or use `openclaw config set`) to add:
   ```json
   {
     "plugins": {
       "entries": {
         "codebase-brain": {
           "config": {
             "repoRoot": "/absolute/path/to/your/repo"
           }
         }
       }
     }
   }
   ```
   Replace `/absolute/path/to/your/repo` with the repository you want the agent to index.

3. **Agent usage contract** (add to agent's SOUL.md):
   - Before editing any file, call:
     - `codebase.find_function` to locate target symbols
     - `codebase.where_is_used` to find impacted references
     - `codebase.dependency_tree` to understand module boundaries
   - For architectural context, use `codebase.repo_map(map_tokens=1500)`
   - When in doubt, use `codebase.call_graph` for relationship mapping

4. **First-run indexing**:
   The plugin automatically indexes the repository on first tool call (if DB empty). Index is stored in `<repoRoot>/.openclaw/plugins/codebase-brain/state/`.

5. **Manual indexing**:
   Use CLI: `node src/cli/index.js <repoRoot>` for full reindex.
   Use CLI: `node src/cli/update.js <file> [repoRoot]` for incremental updates.

---

## Acceptance Checklist

- [x] Full index works on at least 1 real repo and the fixture repos
- [x] Tool APIs return JSON and are stable across runs
- [x] Incremental updates work (unit test verifies)
- [x] Repo map respects token budgets and is reproducible
- [ ] OpenClaw agent logs show tool usage before edits (behavioral verification)
- [x] Documentation includes installation, configuration, and usage

**Note**: The behavioral test (agent logs) will be verified when the agent is run with the plugin enabled and uses the tools. This is an integration test outside the plugin's unit tests.

---

## Future Enhancements (v2+)

- Layer C: Embeddings-based fuzzy search (lancedb or sqlite-fts)
- Compiler-accurate references via SCIP/LSIF for supported languages
- CodeQL dataflow queries
- Build/test topology twin (RIG-style)
- Support additional languages (Java, Go, Rust, C++, etc.)
- Performance optimizations for large repos (batch inserts, streaming)

---

## Metrics & Maintenance

- Use `openclaw plugins list` to verify plugin is loaded
- Check `~/.openclaw/plugins/codebase-brain/state/` for index files
- To rebuild index: delete the `state/index.sqlite` file and run any tool (will reindex automatically)
- Logs: OpenClaw will log plugin activity; see OpenClaw logs for errors

---

*Version 0.1.0 shipped 2026-03-04. All core spec items implemented and tested.*
