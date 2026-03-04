import { resolve, relative, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../database/Database.js';
import { ParserManager } from './parser.js';
import { walkRepo } from './walker.js';
import { CONFIG } from '../config.js';

export class Indexer {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.db = new Database(stateDir);
    this.parser = new ParserManager();
    this.repoRoot = null;
  }

  async init(repoRoot) {
    this.repoRoot = resolve(repoRoot);
    // No global init needed for native tree-sitter
  }

  async indexFull(repoRoot) {
    await this.init(repoRoot);
    console.log(`Indexing repository: ${this.repoRoot}`);

    const files = await walkRepo(this.repoRoot);
    console.log(`Found ${files.length} files to index`);

    const start = Date.now();
    let indexed = 0;
    let skipped = 0;

    for (const file of files) {
      try {
        await this.indexFile(file);
        indexed++;
      } catch (err) {
        console.error(`Failed to index ${file.path}:`, err.message);
        skipped++;
      }
    }

    // Build file graph edges after all files parsed
    await this.buildEdges();

    const elapsed = Date.now() - start;
    console.log(`Indexed ${indexed} files (skipped ${skipped}) in ${(elapsed/1000).toFixed(1)}s`);

    return { indexed, skipped, elapsed };
  }

  async indexFile(fileInfo) {
    const fullPath = fileInfo.fullPath; // already absolute
    const code = await import('fs/promises').then(fs => fs.readFile(fullPath, 'utf-8'));

    // Check if file changed
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(code).digest('hex');
    const mtime = fileInfo.mtime;

    const oldHash = this.db.upsertFile(fileInfo.path, hash, mtime, fileInfo.lang, fileInfo.size);
    if (oldHash === hash) {
      // File unchanged, skip reindex
      return { skipped: true };
    }

    // File changed - clear old data
    this.db.clearFile(fileInfo.path);

    // Parse and extract
    const { symbols, refs, imports } = await this.parser.parseSource(code, fileInfo.path, fileInfo.lang);

    // Store symbols
    for (const sym of symbols) {
      this.db.insertSymbol(sym);
    }

    // Store refs
    for (const ref of refs) {
      this.db.insertRef(ref);
    }

    // Store imports (temporary - resolution happens later)
    for (const imp of imports) {
      this.db.insertImport(imp);
    }

    return { symbols: symbols.length, refs: refs.length, imports: imports.length };
  }

  async buildEdges() {
    console.log('Building file dependency graph...');

    // Build edges from imports
    const imports = this.db.db.prepare(`
      SELECT i.file, i.import_path, i.resolved_file, f.path as resolved
      FROM imports i
      LEFT JOIN files f ON i.resolved_file = f.path OR i.import_path = f.path
    `).all();

    for (const imp of imports) {
      const fromFile = imp.file;
      const toFile = imp.resolved || imp.resolved_file;
      if (toFile && fromFile !== toFile) {
        this.db.insertFileEdge(fromFile, toFile, 1.0, 'import');
      }
    }

    // Build edges from references (defs -> refs)
    // For each ref, link to the symbol's definition file
    const refsWithDefs = this.db.db.prepare(`
      SELECT r.file as ref_file, r.symbol_name, s.file as def_file, COUNT(*) as cnt
      FROM refs r
      JOIN symbols s ON r.symbol_name = s.name
      WHERE s.file IS NOT NULL
      GROUP BY r.file, r.symbol_name, s.file
    `).all();

    for (const row of refsWithDefs) {
      const weight = Math.sqrt(row.cnt);
      this.db.insertFileEdge(row.ref_file, row.def_file, weight, 'reference');
    }

    // Build call graph edges
    console.log('Building call graph...');
    await this.buildCallGraph();

    console.log('Graph building complete');
  }

  async buildCallGraph() {
    // v1: simple heuristic - link definition to all refs in call expressions
    // This is approximate; we'll improve in later versions
    const symbols = this.db.db.prepare(`
      SELECT id, name, file FROM symbols WHERE kind IN ('function', 'method')
    `).all();

    // Build name-to-ids map
    const nameToIds = new Map();
    for (const sym of symbols) {
      if (!nameToIds.has(sym.name)) nameToIds.set(sym.name, []);
      nameToIds.get(sym.name).push(sym.id);
    }

    // For each ref, if the symbol name matches a function, add call edge
    // In v1 we don't know if it's a call, just that it's referenced
    const refs = this.db.db.prepare('SELECT * FROM refs').all();

    for (const ref of refs) {
      const calleeIds = nameToIds.get(ref.symbol_name) || [];
      // Find the caller function that contains this ref line
      // Simplified: assume the ref belongs to the nearest enclosing function
      const caller = this.findEnclosingFunction(ref.file, ref.line);
      if (caller) {
        for (const calleeId of calleeIds) {
          this.db.insertCallEdge(caller.id, ref.symbol_name, 1.0, 'ref_heuristic');
        }
      }
    }
  }

  findEnclosingFunction(file, line) {
    // Find the outermost function containing this line
    const symbol = this.db.db.prepare(`
      SELECT * FROM symbols
      WHERE file = ? AND kind IN ('function', 'method')
        AND start_line <= ? AND end_line >= ?
      ORDER BY (end_line - start_line) ASC
      LIMIT 1
    `).get(file, line, line);
    return symbol || null;
  }

  close() {
    this.db.close();
  }
}
