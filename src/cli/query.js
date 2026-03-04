#!/usr/bin/env node

/**
 * Query CLI - run tool queries against indexed codebase
 *
 * Usage:
 *   node src/cli/query.js find_function '{"name": "login", "limit": 5}'
 *   node src/cli/query.js where_is_used '{"symbol": "User"}'
 *   node src/cli/query.js dependency_tree '{"target": "src/index.ts", "depth": 2}'
 *   node src/cli/query.js call_graph '{"symbol": "loginUser"}'
 *   node src/cli/query.js repo_map '{"map_tokens": 1000}'
 */

import { ToolHandler } from '../tools/ToolHandler.js';
import { join } from 'path';

const [toolName, paramsJson] = process.argv.slice(2);

if (!toolName) {
  console.error(`
Usage: node src/cli/query.js <tool> <params_json>

Tools:
  find_function
  where_is_used
  dependency_tree
  call_graph
  repo_map
  `);
  process.exit(1);
}

const stateDir = join(process.cwd(), '.openclaw/plugins/codebase-brain/state');
const handler = new ToolHandler(stateDir);

try {
  const params = paramsJson ? JSON.parse(paramsJson) : {};
  const result = await handler[toolName](params);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (err) {
  console.error(`❌ Error executing ${toolName}:`, err.message);
  if (err.message.includes('no such table')) {
    console.error('\n💡 Have you indexed the codebase first? Run: node src/cli/index.js');
  }
  process.exit(1);
} finally {
  handler.close();
}
