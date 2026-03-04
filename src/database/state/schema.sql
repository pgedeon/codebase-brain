-- Database Schema (SQLite) for codebase-brain

-- Files table
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  lang TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_files_lang ON files(lang);

-- Symbols table
CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  lang TEXT NOT NULL,
  file TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  start_col INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_col INTEGER NOT NULL,
  signature TEXT,
  container_id TEXT,
  FOREIGN KEY (file) REFERENCES files(path) ON DELETE CASCADE,
  FOREIGN KEY (container_id) REFERENCES symbols(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);

-- References table
CREATE TABLE IF NOT EXISTS refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_name TEXT NOT NULL,
  file TEXT NOT NULL,
  line INTEGER NOT NULL,
  col INTEGER NOT NULL,
  context TEXT,
  evidence TEXT DEFAULT 'identifier',
  FOREIGN KEY (file) REFERENCES files(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_refs_symbol_name ON refs(symbol_name);
CREATE INDEX IF NOT EXISTS idx_refs_file ON refs(file);

-- Imports table
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file TEXT NOT NULL,
  import_path TEXT NOT NULL,
  resolved_file TEXT,
  import_kind TEXT DEFAULT 'module',
  FOREIGN KEY (file) REFERENCES files(path) ON DELETE CASCADE,
  FOREIGN KEY (resolved_file) REFERENCES files(path) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_imports_file ON imports(file);
CREATE INDEX IF NOT EXISTS idx_imports_resolved ON imports(resolved_file);

-- File-level dependency graph
CREATE TABLE IF NOT EXISTS edges_file (
  from_file TEXT NOT NULL,
  to_file TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  reason TEXT NOT NULL,
  PRIMARY KEY (from_file, to_file, reason),
  FOREIGN KEY (from_file) REFERENCES files(path) ON DELETE CASCADE,
  FOREIGN KEY (to_file) REFERENCES files(path) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_edges_file_from ON edges_file(from_file);
CREATE INDEX IF NOT EXISTS idx_edges_file_to ON edges_file(to_file);

-- Call graph (optional)
CREATE TABLE IF NOT EXISTS edges_call (
  caller_symbol_id TEXT NOT NULL,
  callee_name TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  evidence TEXT DEFAULT 'call_expr',
  PRIMARY KEY (caller_symbol_id, callee_name, evidence),
  FOREIGN KEY (caller_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_edges_call_caller ON edges_call(caller_symbol_id);
CREATE INDEX IF NOT EXISTS idx_edges_call_callee ON edges_call(callee_name);

-- Config table (migration tracking)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

INSERT OR IGNORE INTO config (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO config (key, value) VALUES ('indexer_version', '0.1.0');

-- Views
CREATE VIEW IF NOT EXISTS symbol_refs_view AS
SELECT
  r.symbol_name,
  COUNT(*) as ref_count,
  GROUP_CONCAT(DISTINCT r.file) as files
FROM refs r
GROUP BY r.symbol_name;

CREATE VIEW IF NOT EXISTS file_deps_view AS
SELECT
  from_file,
  COUNT(DISTINCT to_file) as out_degree,
  GROUP_CONCAT(to_file) as out_files
FROM edges_file
GROUP BY from_file;
