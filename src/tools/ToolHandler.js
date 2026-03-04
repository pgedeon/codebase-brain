import { Database } from '../database/Database.js';
import { join } from 'path';

export class ToolHandler {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.db = new Database(stateDir);
  }

  /**
   * Tool: codebase.find_function
   */
  async find_function(params) {
    const { name, limit = 10, prefer_files = [], lang = null } = params;
    const matches = this.db.findFunctions(name, { limit, preferFiles: prefer_files, lang });
    return {
      query: name,
      matches: matches.map(m => ({
        symbol_id: m.id,
        name: m.name,
        kind: m.kind,
        file: m.file,
        path: m.file,
        range: {
          start: [m.start_line, m.start_col],
          end: [m.end_line, m.end_col],
        },
        signature: m.signature,
        score: m.score,
      })),
      notes: prefer_files.length > 0 ? [`Boosted files: ${prefer_files.join(', ')}`] : [],
    };
  }

  /**
   * Tool: codebase.where_is_used
   */
  async where_is_used(params) {
    const { symbol, limit = 200, file_glob = null } = params;
    const result = this.db.whereIsUsed(symbol, { limit, fileGlob: file_glob });
    return {
      symbol,
      refs: result.refs,
      counts: result.counts,
    };
  }

  /**
   * Tool: codebase.dependency_tree
   */
  async dependency_tree(params) {
    const { target, mode = 'imports', depth = 3 } = params;
    return this.db.dependencyTree(target, mode, depth);
  }

  /**
   * Tool: codebase.call_graph
   */
  async call_graph(params) {
    const { symbol, direction = 'both', depth = 2 } = params;
    return this.db.callGraph(symbol, direction, depth);
  }

  /**
   * Tool: codebase.repo_map
   */
  async repo_map(params) {
    const { map_tokens = 1500, focus_files = [], strategy = 'pagerank' } = params;
    return this.db.repoMap({ map_tokens, focus_files, strategy });
  }

  close() {
    this.db.close();
  }
}
