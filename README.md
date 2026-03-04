# codebase-brain

**OpenClaw Codebase Digital Twin Plugin**

A practical implementation of a codebase indexing and navigation system for OpenClaw agents. Provides deterministic, structured tools for code navigation, dependency analysis, and architectural understanding.

## Status

🚧 In active development - see [codebase-brain.md](codebase-brain.md) for the implementation plan and progress tracking.

## Overview

This plugin implements the `codebase-brain` spec from codebase-brain.md, providing:

- **Layer A**: Tree-sitter AST parsing for robust symbol extraction
- **Layer B**: Deterministic navigation graphs (symbol/ref + dependency graphs)
- **Layer C** (planned): Retrieval for fuzzy queries via embeddings

### Tools

- `codebase.find_function(name, opts?)` - Locate function/class definitions
- `codebase.where_is_used(symbol, opts?)` - Find all references to a symbol
- `codebase.call_graph(symbol, opts?)` - Build call/caller graph
- `codebase.dependency_tree(file_or_module, opts?)` - Module dependency tree
- `codebase.repo_map(opts?)` - Token-budgeted architectural snapshot

## Development

This repository tracks implementation progress alongside OpenClaw heartbeats. See `codebase-brain.md` for the detailed specification and acceptance checklist.

## License

TBD - to be determined based on OpenClaw ecosystem licensing.
