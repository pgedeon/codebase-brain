#!/usr/bin/env node
/**
 * Quick demo script - runs sample queries after indexing
 */

import { execSync } from 'child_process';
import { join } from 'path';

const repo = process.argv[2] || process.cwd();
console.log(`🔍 Demo: indexing and querying ${repo}\n`);

// Index
console.log('1️⃣ Indexing...');
execSync(`node src/cli/index.js`, { stdio: 'inherit', cwd: repo });

// Demo queries
const queries = [
  ['find_function', '{"name": "main", "limit": 5}'],
  ['where_is_used', '{"symbol": "console"}'],
  ['dependency_tree', '{"target": "package.json", "depth": 1}'],
  ['repo_map', '{"map_tokens": 800}'],
];

for (const [tool, params] of queries) {
  try {
    console.log(`\n2️⃣${queries.indexOf([tool,params]) + 1} Tool: ${tool}`);
    const output = execSync(`node src/cli/query.js ${tool} '${params}'`, { encoding: 'utf-8', cwd: repo });
    const result = JSON.parse(output);
    console.log(`   ✅ Success - ${JSON.stringify(result).slice(0, 100)}...`);
  } catch (err) {
    console.log(`   ⚠️  ${err.message}`);
  }
}
