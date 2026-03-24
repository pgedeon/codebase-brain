# codebase-brain

**OpenClaw Codebase Digital Twin Plugin**

A practical implementation of a codebase indexing and navigation system for OpenClaw agents. Provides deterministic, structured tools for code navigation, dependency analysis, and architectural understanding.

## Status

✅ **v1.0.0 Complete** - Fully functional, tested, and ready for OpenClaw integration.

- Core indexing (TypeScript, JavaScript, Python) verified
- All tool APIs returning structured JSON
- Unit test suite passing
- OpenClaw plugin manifest and registration included

## Overview

This plugin implements the `codebase-brain` spec from `codebase-brain.md`, providing:

- **Layer A**: Tree-sitter AST parsing for robust symbol extraction
- **Layer B**: Deterministic navigation graphs (symbol/ref + dependency graphs)
- **Unit testing**: Comprehensive tests using fixture repositories
- **OpenClaw integration**: Plugin can be installed via `openclaw plugins install`

### Tools

All tools accept JSON input and return JSON output.

| Tool | Description |
|------|-------------|
| `codebase.find_function` | Find function/class/method definitions by name |
| `codebase.where_is_used` | Find all references to a symbol across the codebase |
| `codebase.dependency_tree` | Build module dependency tree from imports |
| `codebase.call_graph` | Build call/caller graph (best-effort heuristic) |
| `codebase.repo_map` | Token-budgeted architectural snapshot (PageRank-ranked) |

See `codebase-brain.md` for full API specifications.

---

## Quickstart (OpenClaw)

### 1. Install the plugin

```bash
# From the plugin directory (or any path)
openclaw plugins install ~/codebase-brain
```

This copies the plugin to OpenClaw's extensions directory and installs dependencies.

### 2. Configure the plugin

Edit your OpenClaw config (usually `~/.openclaw/config.json`) to enable the plugin and point it at a repository:

```json
{
  "plugins": {
    "entries": {
      "codebase-brain": {
        "enabled": true,
        "config": {
          "repoRoot": "/absolute/path/to/your/repo"
        }
      }
    }
  }
}
```

**Note**: The index will be created at `<repoRoot>/.openclaw/plugins/codebase-brain/state/`.

### 3. Agent usage contract

Add the following to your agent's `SOUL.md` (or equivalent) to ensure architecture-first navigation:

```markdown
## Code Navigation Protocol

Before editing any file, always:

1. `codebase.find_function({ name: "<target>" })` to locate symbols.
2. `codebase.where_is_used({ symbol: "<target>" })` to find all call sites.
3. `codebase.dependency_tree({ target: "<file>", mode: "imports", depth: 3 })` to understand module boundaries.
4. For overall context, `codebase.repo_map({ map_tokens: 1500, focus_files: [...] })`.
```

---

## Development & Testing

### Prerequisites

- Node.js 20+
- Dependencies: `tree-sitter`, `tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-python`, `better-sqlite3`

### Install dependencies

```bash
npm install
```

### Run tests

```bash
npm test
```

The test suite includes:
- Indexing of TypeScript and Python fixtures
- Tool query correctness
- Incremental update verification

### Manual CLI usage

Index a repository:

```bash
node src/cli/index.js /path/to/repo
```

Query tools:

```bash
node src/cli/query.js find_function '{"name":"UserRepository"}'
node src/cli/query.js where_is_used '{"symbol":"User"}'
node src/cli/query.js dependency_tree '{"target":"src/index.ts","depth":2}'
node src/cli/query.js call_graph '{"symbol":"loginUser"}'
node src/cli/query.js repo_map '{"map_tokens":1000}'
```

Incremental update (single file):

```bash
node src/cli/update.js path/to/file.js /path/to/repo
```

---

## Project Layout

```
codebase-brain/
├── .openclaw/plugins/codebase-brain/state/  # SQLite index (created on first use)
├── fixtures/               # Test fixtures (ts-mini, py-mini)
│   ├── ts-mini/
│   └── py-mini/
├── src/
│   ├── cli/
│   │   ├── index.js       # Full indexing CLI
│   │   ├── update.js      # Incremental update CLI
│   │   └── query.js       # Query tool CLI
│   ├── database/
│   │   ├── Database.js
│   │   └── state/schema.sql
│   ├── indexer/
│   │   ├── Indexer.js
│   │   ├── parser.js
│   │   └── walker.js
│   ├── tools/
│   │   └── ToolHandler.js
│   └── plugin.ts          # OpenClaw plugin entry point
├── tests/
│   └── index.test.js
├── openclaw.plugin.json   # Plugin manifest for OpenClaw
├── package.json
└── PROGRESS.md            # Development log
```

---

## Storage Layout

The index is stored in the target repository under:

```
<repoRoot>/.openclaw/plugins/codebase-brain/state/
```

Contains:

- `index.sqlite` - SQLite database with tables: files, symbols, refs, imports, edges_file, edges_call, config
- (future) `vectors/` - For Layer C embedding index (LanceDB or SQLite FTS)

---

## License

MIT - see LICENSE file (to be added).

---

##Questions?

- **Progress tracking**: See `PROGRESS.md` for detailed implementation log.
- **Specification**: See `codebase-brain.md` for the full design document.
- **Issues**: File an issue on GitHub: https://github.com/pgedeon/codebase-brain

---

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-PayPal-blue)](https://www.paypal.com/donate/?business=petermgedeon%40gmail.com)