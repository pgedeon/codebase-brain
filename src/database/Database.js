import betterSqlite3 from 'better-sqlite3';
import { argv, exit } from 'process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { loadSchema } from '../database/schema.js';
import { CONFIG } from '../config.js';

export class Database {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.dbPath = join(stateDir, 'index.sqlite');
    this.ensureDir();
    this.db = new betterSqlite3(this.dbPath, {
      verbose: process.env.DEBUG ? console.log : undefined,
    });
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  ensureDir() {
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
  }

  init() {
    const schema = loadSchema();
    const statements = schema.split(';').filter(s => s.trim());
    const transaction = this.db.transaction(() => {
      for (const stmt of statements) {
        try {
          this.db.exec(stmt + ';');
        } catch (err) {
          if (!err.message.includes('already exists')) {
            throw err;
          }
        }
      }
    });
    transaction();
  }

  /**
   * Upsert file record, return previous hash if exists
   */
  upsertFile(filePath, sha256, mtime, lang, bytes) {
    // Get old hash if exists
    const oldRow = this.db.prepare('SELECT sha256 FROM files WHERE path = ?').get(filePath);
    const oldHash = oldRow?.sha256 || null;

    // Upsert file record
    const stmt = this.db.prepare(`
      INSERT INTO files (path, sha256, mtime, lang, bytes, indexed_at)
      VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
      ON CONFLICT(path) DO UPDATE SET
        sha256 = excluded.sha256,
        mtime = excluded.mtime,
        lang = excluded.lang,
        bytes = excluded.bytes,
        indexed_at = strftime('%s', 'now')
    `);
    stmt.run(filePath, sha256, mtime, lang, bytes);
    return oldHash;
  }

  /**
   * Clear all symbols and refs for a file (before reindexing)
   */
  clearFile(filePath) {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM symbols WHERE file = ?').run(filePath);
      this.db.prepare('DELETE FROM refs WHERE file = ?').run(filePath);
      this.db.prepare('DELETE FROM imports WHERE file = ?').run(filePath);
      this.db.prepare('DELETE FROM edges_file WHERE from_file = ? OR to_file = ?').run(filePath, filePath);
      this.db.prepare('DELETE FROM edges_call WHERE caller_symbol_id IN (SELECT id FROM symbols WHERE file = ?)').run(filePath);
    });
    transaction();
  }

  clearEdges() {
    const transaction = this.db.transaction(() => {
      this.db.exec('DELETE FROM edges_file');
      this.db.exec('DELETE FROM edges_call');
    });
    transaction();
  }

  /**
   * Insert symbol
   */
  insertSymbol(symbol) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO symbols
      (id, name, kind, lang, file, start_line, start_col, end_line, end_col, signature, container_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      symbol.id,
      symbol.name,
      symbol.kind,
      symbol.lang,
      symbol.file,
      symbol.start_line,
      symbol.start_col,
      symbol.end_line,
      symbol.end_col,
      symbol.signature || null,
      symbol.container_id || null
    );
  }

  /**
   * Insert reference
   */
  insertRef(ref) {
    const stmt = this.db.prepare(`
      INSERT INTO refs (symbol_name, file, line, col, context, evidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(ref.symbol_name, ref.file, ref.line, ref.col, ref.context || null, ref.evidence || 'identifier');
  }

  /**
   * Insert import
   */
  insertImport(imp) {
    const stmt = this.db.prepare(`
      INSERT INTO imports (file, import_path, resolved_file, import_kind)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(imp.file, imp.import_path, imp.resolved_file || null, imp.import_kind || 'module');
  }

  /**
   * Insert file edge
   */
  insertFileEdge(fromFile, toFile, weight, reason) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO edges_file (from_file, to_file, weight, reason)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(fromFile, toFile, weight, reason);
  }

  /**
   * Insert call edge
   */
  insertCallEdge(callerId, calleeName, weight, evidence) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO edges_call (caller_symbol_id, callee_name, weight, evidence)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(callerId, calleeName, weight, evidence || 'call_expr');
  }

  /**
   * Query: find functions by name
   */
  findFunctions(name, opts = {}) {
    const { limit = 10, preferFiles = [], lang = null } = opts;
    let query = `
      SELECT s.*, f.path as file_path
      FROM symbols s
      JOIN files f ON s.file = f.path
      WHERE s.name = ? AND s.kind IN ('function', 'method', 'class')
    `;
    const params = [name];
    if (lang) {
      query += ' AND s.lang = ?';
      params.push(lang);
    }
    query += ' ORDER BY s.file';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    const rows = this.db.prepare(query).all(...params);

    // Score based on prefer_files boost
    const scored = rows.map(row => {
      let score = 0.5; // base
      if (preferFiles.some(pf => row.file.includes(pf))) {
        score += 0.5;
      }
      return { ...row, score };
    }).sort((a, b) => b.score - a.score);

    return scored;
  }

  /**
   * Query: where is symbol used
   */
  whereIsUsed(symbol, opts = {}) {
    const { limit = 200, fileGlob = null } = opts;
    let query = `
      SELECT r.*, f.path as file_path
      FROM refs r
      JOIN files f ON r.file = f.path
      WHERE r.symbol_name = ?
    `;
    const params = [symbol];
    if (fileGlob) {
      query += ' AND r.file GLOB ?';
      params.push(fileGlob);
    }
    query += ' ORDER BY r.file, r.line';
    if (limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    const refs = this.db.prepare(query).all(...params);

    // Count by file
    const counts = {};
    for (const r of refs) {
      counts[r.file] = (counts[r.file] || 0) + 1;
    }

    return {
      symbol,
      refs: refs.map(r => ({
        file: r.file,
        pos: [r.line, r.col],
        context: r.context,
      })),
      counts: {
        total: refs.length,
        by_file: Object.entries(counts),
      },
    };
  }

  /**
   * Query: dependency tree (imports mode)
   */
  dependencyTree(target, mode = 'imports', depth = 3) {
    if (mode !== 'imports') {
      throw new Error(`Unsupported mode: ${mode}. Only 'imports' implemented in v1.`);
    }
    // Build tree recursively through imports
    const seen = new Set();
    function buildTree(file, currentDepth) {
      if (currentDepth > depth || seen.has(file)) return null;
      seen.add(file);

      const imports = this.db.prepare(`
        SELECT i.import_path, i.resolved_file, f.path as resolved
        FROM imports i
        LEFT JOIN files f ON i.resolved_file = f.path
        WHERE i.file = ?
      `).all(file);

      const children = [];
      for (const imp of imports) {
        const resolved = imp.resolved || imp.resolved_file || imp.import_path;
        if (resolved) {
          children.push(buildTree.call(this, resolved, currentDepth + 1) || { file: resolved, deps: [] });
        }
      }

      return { file, deps: children };
    }

    return {
      target,
      mode,
      tree: buildTree.call(this, target, 0) || { file: target, deps: [] },
    };
  }

  /**
   * Query: call graph (best-effort)
   */
  callGraph(symbol, direction = 'both', depth = 2) {
    // v1: use edges_call table
    const result = { symbol, calls: [], called_by: [] };

    if (direction === 'both' || direction === 'out') {
      // Find calls FROM this symbol
      const out = this.db.prepare(`
        SELECT ec.callee_name, ec.weight, ec.evidence
        FROM edges_call ec
        JOIN symbols s ON ec.caller_symbol_id = s.id
        WHERE s.name = ? AND s.kind IN ('function', 'method')
      `).all(symbol);
      result.calls = out;
    }

    if (direction === 'both' || direction === 'in') {
      // Find references TO this symbol as callee
      const inRefs = this.db.prepare(`
        SELECT s.id as caller_id, s.name as caller_name, ec.weight, ec.evidence
        FROM edges_call ec
        JOIN symbols s ON ec.caller_symbol_id = s.id
        WHERE ec.callee_name = ? AND s.kind IN ('function', 'method')
      `).all(symbol);
      result.called_by = inRefs;
    }

    return result;
  }

  /**
   * Query: repo map (token-budgeted)
   */
  repoMap(opts = {}) {
    const {
      mapTokens = CONFIG.DEFAULT_MAP_TOKENS,
      focusFiles = [],
      strategy = 'pagerank',
    } = opts;

    // Compute PageRank if needed
    let fileScores = new Map();
    if (strategy === 'pagerank') {
      fileScores = this.computePageRank(focusFiles);
    } else {
      // Fallback: all files get equal score
      const allFiles = this.db.prepare('SELECT path FROM files').all();
      for (const f of allFiles) {
        fileScores.set(f.path, 1.0);
      }
      // Boost focus files
      for (const ff of focusFiles) {
        fileScores.set(ff, (fileScores.get(ff) || 0) * 2);
      }
    }

    // Get top symbols per file (top 5 by name for token budget)
    const fileSymbols = {};
    const tokenEstimate = { total: 0 };

    // Sort files by score
    const sortedFiles = Array.from(fileScores.entries())
      .sort((a, b) => b[1] - a[1]);

    for (const [file, score] of sortedFiles) {
      const symbols = this.db.prepare(`
        SELECT name, kind, signature
        FROM symbols
        WHERE file = ? AND kind IN ('function', 'class', 'method')
        ORDER BY name
        LIMIT 5
      `).all(file);

      if (symbols.length === 0) continue;

      const lines = [`## ${file}`];
      for (const sym of symbols) {
        const sig = sym.signature || sym.name;
        lines.push(`- ${sym.kind} ${sig}`);
      }

      const text = lines.join('\n');
      if (tokenEstimate.total + text.length > mapTokens * 4) break; // rough char/token ratio

      fileSymbols[file] = symbols;
      tokenEstimate.total += text.length;
    }

    // Build text view
    const textLines = ['# Codebase Map (token-budgeted)\n'];
    for (const file of Object.keys(fileSymbols)) {
      textLines.push(`## ${file}`);
      for (const sym of fileSymbols[file]) {
        textLines.push(`- ${sym.kind} ${sym.signature || sym.name}`);
      }
    }
    const text = textLines.join('\n');

    return {
      map_tokens: mapTokens,
      focus_files: focusFiles,
      strategy,
      text,
      top_symbols: fileSymbols,
    };
  }

  /**
   * Compute simplified PageRank over file graph
   */
  computePageRank(seedFiles = [], iterations = 20, damping = 0.85) {
    const allFiles = this.db.prepare('SELECT path FROM files').all();
    const N = allFiles.length;
    if (N === 0) return new Map();

    // Build adjacency
    const outEdges = new Map(); // file -> [toFiles]
    const inEdges = new Map();  // toFile -> [fromFiles]
    const rows = this.db.prepare('SELECT from_file, to_file FROM edges_file').all();
    for (const row of rows) {
      if (!outEdges.has(row.from_file)) outEdges.set(row.from_file, []);
      outEdges.get(row.from_file).push(row.to_file);
      if (!inEdges.has(row.to_file)) inEdges.set(row.to_file, []);
      inEdges.get(row.to_file).push(row.from_file);
    }

    // Initialize scores
    let scores = new Map();
    for (const f of allFiles) {
      scores.set(f.path, seedFiles.includes(f.path) ? 1.0 : 0.1);
    }

    // Iterate
    for (let i = 0; i < iterations; i++) {
      const newScores = new Map();
      for (const file of allFiles.map(f => f.path)) {
        let sum = 0;
        const inList = inEdges.get(file) || [];
        for (const src of inList) {
          const outCount = (outEdges.get(src) || []).length;
          if (outCount > 0) {
            sum += scores.get(src) / outCount;
          }
        }
        const teleport = seedFiles.includes(file) ? 0.3 : 0.05;
        newScores.set(file, teleport + damping * sum);
      }
      scores = newScores;
    }

    // Normalize
    const max = Math.max(...scores.values());
    for (const [k, v] of scores) {
      scores.set(k, v / max);
    }

    return scores;
  }

  close() {
    this.db.close();
  }
}
