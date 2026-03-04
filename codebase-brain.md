# codebase-brain.md
*A practical implementation + test plan for an OpenClaw "Codebase Digital Twin" plugin (aka `codebase-brain`).*

This document is written so an OpenClaw coding agent can follow it step-by-step to **build**, **wire into OpenClaw**, and **prove it works** with repeatable tests.

---

## 0) Goal (what "working" means)
When implemented, OpenClaw must be able to call these tools and get **structured, deterministic** results:

- `codebase.find_function(name, opts?)`
- `codebase.where_is_used(symbol, opts?)`
- `codebase.call_graph(symbol, opts?)`
- `codebase.dependency_tree(file_or_module, opts?)`
- `codebase.repo_map(opts?)` (token-budgeted architectural snapshot)

"Working" is verified when:
1. The plugin can index a real repo (fast enough to be usable).
2. Tool calls return correct locations/edges on fixture repos and at least one real repo.
3. Incremental updates (change 1 file) update results without full reindex.
4. OpenClaw agent can answer navigation questions **without** random-file edits.

---

## 1) Architecture: a layered digital twin
Implement **three layers** (start with Layer A and B, then add C):

### Layer A: Syntax backbone (tree-sitter)
- Purpose: reliable code boundaries even with partial/broken code.
- Artifact: **per-file AST-derived symbols** (functions/classes/methods) + spans.

### Layer B: Deterministic navigation graphs (symbol/ref + dependency graphs)
- Purpose: fast, high-precision APIs for `find_function`, `where_is_used`, `dependency_tree`.
- Artifact: a **symbol table** + **reference index** + **graphs** (file graph + optional call graph).

### Layer C: Retrieval for fuzzy queries (embeddings + ranking)
- Purpose: "Where is login handled?" even without exact identifiers.
- Artifact: AST-aware chunks embedded into a vector index + reranking.

> You can ship a very usable v1 with A+B. Add C once the deterministic tools are stable.

---

## 2) Storage layout (simple, fast, portable)
Use **SQLite** for deterministic indices + graphs, and **LanceDB** (or SQLite FTS + embeddings later) for vector search.

### Recommended on-disk structure
```
.openclaw/
 plugins/
 codebase-brain/
 state/
 index.sqlite
 vectors/ # LanceDB
 cache.json # file hashes, parser versions, config
 logs/
 fixtures/ # small test repos (git submodules or copied)
 tools/ # MCP server or OpenClaw tool adapters
 src/
```

### SQLite tables (minimum viable)
- `files(path TEXT PRIMARY KEY, sha256 TEXT, mtime INTEGER, lang TEXT, bytes INTEGER)`
- `symbols(id TEXT PRIMARY KEY, name TEXT, kind TEXT, lang TEXT, file TEXT, start_line INT, start_col INT, end_line INT, end_col INT, signature TEXT, container_id TEXT NULL)`
- `refs(id INTEGER PRIMARY KEY AUTOINCREMENT, symbol_name TEXT, file TEXT, line INT, col INT, context TEXT)` 
 - `symbol_name` is v1 heuristic: exact identifier string.
 - Later: replace with resolved `symbol_id` for compiler-accurate refs (SCIP/LSIF).
- `imports(id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT, import_path TEXT, resolved_file TEXT NULL)`
- `edges_file(from_file TEXT, to_file TEXT, weight REAL, reason TEXT)` (defs/refs/imports)
- `edges_call(caller_symbol_id TEXT, callee_name TEXT, weight REAL, evidence TEXT)` (optional v1)

Indexes:
- `CREATE INDEX idx_symbols_name ON symbols(name);`
- `CREATE INDEX idx_refs_symbol_name ON refs(symbol_name);`
- `CREATE INDEX idx_imports_file ON imports(file);`
- `CREATE INDEX idx_edges_file_from ON edges_file(from_file);`

---

## 3) Tool API surface (what OpenClaw calls)
Expose tools via OpenClaw's tool system (or MCP server if that's your integration path). The tools must return **JSON**, never prose.

### 3.1 `codebase.find_function`
**Input**
```json
{ "name": "createUser", "limit": 10, "prefer_files": ["services/auth"], "lang": null }
```

**Output**
```json
{
 "query": "createUser",
 "matches": [
 {
 "symbol_id": "sym_...",
 "name": "createUser",
 "kind": "function",
 "file": "services/auth/user.ts",
 "range": { "start": [120, 0], "end": [182, 1] },
 "signature": "createUser(email: string, ...): Promise<User>",
 "score": 0.93
 }
 ],
 "notes": ["disambiguated using prefer_files"]
}
```

### 3.2 `codebase.where_is_used`
**Input**
```json
{ "symbol": "UserRepository", "limit": 200, "file_glob": null }
```

**Output**
```json
{
 "symbol": "UserRepository",
 "refs": [
 { "file": "services/auth/login.ts", "pos": [44, 12], "context": "new UserRepository(...)" }
 ],
 "counts": { "total": 37, "by_file": [["services/auth/login.ts", 4]] }
}
```

### 3.3 `codebase.dependency_tree`
Supports both:
- "module imports" dependency tree (imports graph)
- "symbol reference" dependency neighborhood (file graph)

**Input**
```json
{ "target": "api.ts", "mode": "imports", "depth": 3 }
```

**Output**
```json
{
 "target": "api.ts",
 "mode": "imports",
 "tree": {
 "file": "api.ts",
 "deps": [
 { "file": "services/auth/index.ts", "deps": [ ... ] }
 ]
 }
}
```

### 3.4 `codebase.call_graph`
Start v1 as "best-effort":
- calls detected via tree-sitter node patterns (function call expressions)
- static languages will be approximate until you add SCIP/LSIF/Language Server backing

**Input**
```json
{ "symbol": "loginUser", "direction": "both", "depth": 2 }
```

**Output**
```json
{
 "symbol": "loginUser",
 "calls": [
 { "from": "loginUser", "to": "UserRepository.findByEmail", "evidence": "call_expr", "weight": 1.0 }
 ],
 "called_by": [
 { "from": "AuthController.postLogin", "to": "loginUser", "evidence": "call_expr", "weight": 1.0 }
 ]
}
```

### 3.5 `codebase.repo_map`
Produces a **token-budgeted** map. Return both:
- a compact text view (for context injection)
- and a structured list (for programmatic use)

**Input**
```json
{ "map_tokens": 1500, "focus_files": ["services/auth/login.ts"], "strategy": "pagerank" }
```

**Output**
```json
{
 "map_tokens": 1500,
 "focus_files": ["services/auth/login.ts"],
 "text": "…",
 "top_symbols": [
 { "file": "services/auth/user.ts", "symbols": ["createUser", "loginUser"] }
 ]
}
```

---

## 4) Implementation steps (v1 that ships)
### 4.1 Repo discovery
- Respect `.gitignore` and an allowlist of file extensions.
- Store `sha256` (or fast hash) per file in `files`.

**Algorithm**
1. Walk repo files (exclude `node_modules`, `dist`, `.venv`, etc.)
2. For each file:
 - detect language by extension
 - hash content
 - if unchanged (hash matches DB), skip parsing

### 4.2 Tree-sitter parsing
Use a multi-language tree-sitter bundle (Node or Python). Either is fine:
- Node: `web-tree-sitter` + language WASMs
- Python: `tree_sitter` + prebuilt grammars

**Parse output must produce:**
- symbol definitions (name, kind, span, signature)
- identifier references (best-effort)
- import statements (module deps)

**Symbol extraction (defs)**
- For each supported language, implement:
 - pattern match on function/class/method nodes
 - extract name token
 - capture range
 - compute signature string (best-effort; keep it stable)

**Reference extraction (refs)**
- v1 heuristic: record identifier nodes that occur in:
 - call expressions
 - object creation expressions
 - type annotations (TS/Java)
 - member access chains (`UserRepository.findByEmail`)

Store in `refs(symbol_name, file, line, col, context)`.

> This is not compiler-accurate "find references", but it's extremely useful and works cross-language.

### 4.3 Build deterministic graphs
#### Imports graph (module dependency)
- `imports(file -> import_path)` with best-effort `resolved_file`:
 - resolve relative paths
 - for TS/JS, handle `index.ts` / `index.js`
 - optionally read `tsconfig` paths later

#### File graph (defs/refs)
- For each `ref` occurrence:
 - find candidate definition files that define `symbol_name` (from `symbols`)
 - add `edges_file(ref_file -> def_file)` with weight:
 - `weight += sqrt(num_refs_in_file_to_symbol)`
- Also add `edges_file(file -> resolved_import_file)` weight 1.0 reason `import`

This yields:
- ranking (PageRank)
- neighborhood queries ("what connects to what")
- dependency_tree modes

### 4.4 Ranking: PageRank for repo_map
Implement PageRank over `edges_file`.
- Personalize PageRank toward `focus_files` (if provided).
- Convert file scores into "top symbols" by selecting highest-ranked symbols within those files.
- Enforce token budget: include signatures only, collapse bodies.

### 4.5 Layer C (optional): Embeddings index
Only after A+B are stable:
1. Chunk code by AST nodes (functions/classes)
2. If node is too large:
 - store a **collapsed form**: signature + elided body
3. Embed chunk text and insert into LanceDB:
 - fields: `chunk_id, file, range, kind, symbol_name, text, embedding`
4. `codebase.search(query)` returns top chunks plus file/symbol metadata
5. Combine retrieval:
 - BM25/lexical filter (optional)
 - vector similarity
 - rerank (optional) with a small local model

---

## 5) Integration into OpenClaw
### 5.1 Plugin registration
Create a plugin package `codebase-brain` that exposes tool definitions and a runtime.

Minimum deliverables:
- `manifest.json` (plugin name, version, tools list)
- `tools/` adapter that registers tool handlers
- `src/indexer/` with `index_repo()` and `update_file()`
- `src/query/` with the five tool implementations

### 5.2 OpenClaw agent usage contract (rules)
Add this to the relevant agent's `SOUL.md` (or equivalent):

1. **Before editing any file**, call:
 - `codebase.find_function` for target symbols
 - `codebase.where_is_used` for impacted symbols
 - `codebase.dependency_tree` for module boundaries
2. Use `codebase.repo_map(map_tokens=…)` to build architecture context for big tasks.
3. When uncertain, use `codebase.search(query)` (if embeddings enabled) to find candidates, then confirm with deterministic tools.

This ensures OpenClaw reasons "architecture-first" rather than "random-file-first".

---

## 6) Testing plan (prove it works, not vibes)
You need **three** test layers: unit, integration, and "agent behavior" tests.

### 6.1 Unit tests: index correctness on fixtures
Create fixture repos under `fixtures/`:
- `fixtures/ts-mini/` (TypeScript: imports, classes, methods)
- `fixtures/py-mini/` (Python: functions, classes, imports)
- `fixtures/mixed-mini/` (JS + TS + Python, simple boundaries)

For each fixture repo, store golden snapshots:
- `golden.symbols.json`
- `golden.refs.json`
- `golden.imports.json`
- `golden.edges_file.json`

**Unit test assertions**
- Symbols extracted match expected names + ranges (line numbers can vary; prefer "contains" checks + stable identifiers)
- `where_is_used("X")` returns at least the expected files and minimum counts
- `dependency_tree("entry.ts", "imports")` returns the expected subtree
- `repo_map(map_tokens=...)` includes expected "core symbols"

### 6.2 Integration tests: incremental updates
Test that changing one file updates indices correctly without full reindex.

**Procedure**
1. Index fixture repo
2. Modify one file (add a function `newFn`, add a ref to existing symbol)
3. Run incremental index update
4. Assert:
 - `symbols` contains `newFn`
 - `refs` count increases for the referenced symbol
 - PageRank changes in expected direction (the modified file becomes more central)

### 6.3 Performance tests (sanity)
On a real repo of moderate size:
- Measure:
 - full index time
 - incremental update time for 1 changed file
 - query latency per tool (p95)
- Set minimum acceptable targets (example):
 - full index < 60s for ~5k files
 - incremental update < 2s per file
 - query latency < 250ms local

### 6.4 "Agent behavior" tests (does OpenClaw actually use it?)
Create scripted tasks OpenClaw must solve and verify tool usage via logs.

**Task examples**
- "Rename `createUser` to `registerUser` safely."
 - Pass criteria: agent calls `find_function` and `where_is_used` before edits; updates all call sites; tests pass.
- "Add a parameter to `loginUser` and update dependents."
 - Pass criteria: agent uses `call_graph` or `where_is_used` to find callers.

Log-based assertions:
- The agent made at least one call to each relevant tool before editing.
- No edits occurred before initial navigation tools ran.

---

## 7) Operational safety and maintenance
### 7.1 Index invalidation rules
Rebuild entire index if:
- tree-sitter grammar versions change
- plugin schema version changes
- repo root changes

Otherwise incremental update:
- on file add/change/delete

### 7.2 Sandboxing
If you later add compiler-accurate indexers (SCIP/LSIF):
- run them in a **sandboxed executor** process/container
- never execute repo code inside the OpenClaw core process

### 7.3 Degraded mode behavior
If indexing is disabled or stale:
- `repo_map` falls back to file tree + top-level signatures only
- `where_is_used` falls back to ripgrep-like lexical search with context lines
- Always return `notes` describing degraded mode

---

## 8) Optional upgrades (v2+)
### 8.1 Compiler-accurate refs with SCIP/LSIF
For languages with good indexers (TS, Java, Go, Rust):
- generate SCIP/LSIF in CI or locally
- ingest into SQLite tables:
 - `resolved_refs(symbol_id -> anchors)`
- upgrade `where_is_used` to prefer resolved refs when available

### 8.2 CodeQL-backed call graph + dataflow
If you want "real" call graphs and deeper reasoning:
- build CodeQL database per language
- expose new tools:
 - `codebase.dataflow(source, sink, ...)`
 - `codebase.calls_between(a, b)`

### 8.3 Build/Test topology twin (RIG-style)
Add a build/test graph:
- nodes: build components, test runners, test targets
- edges: dependency and coverage relations
- tool: `codebase.build_test_map()`

This dramatically reduces agent confusion in multi-tool repos.

---

## 9) Acceptance checklist
A PR is "done" when all are true:
- [ ] Full index works on at least 1 real repo and the fixture repos
- [ ] Tool APIs return JSON and are stable across runs
- [ ] Incremental updates pass tests
- [ ] Repo map respects token budgets and is reproducible
- [ ] OpenClaw agent logs show tool usage before edits
- [ ] Documentation includes how to enable/disable indexing and how to clear state

---

## 10) Quickstart command script (example)
You should provide a `scripts/` folder with:
- `index_full.sh`
- `index_watch.sh`
- `query_demo.sh`
- `run_tests.sh`

Example behaviors:
- `index_full.sh`: indexes current repo into `.openclaw/plugins/codebase-brain/state/`
- `index_watch.sh`: file watcher that triggers incremental updates
- `query_demo.sh`: runs 10 representative tool queries and prints JSON
- `run_tests.sh`: runs unit + integration + behavior tests

---

## 11) What to build first (sequence that avoids traps)
1. **Symbols + ranges** (Layer A defs)
2. **Imports graph** (dependency_tree imports)
3. **Refs heuristic** + `where_is_used`
4. **File graph** + PageRank + `repo_map`
5. **Best-effort call graph**
6. Embeddings + hybrid search (only after deterministic tools are trusted)
7. Optional SCIP/LSIF (precision upgrade where needed)

If you do it in this order, you get value early and avoid "embedding-only" precision problems.
