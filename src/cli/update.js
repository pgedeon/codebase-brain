#!/usr/bin/env node

import { Indexer } from '../indexer/Indexer.js';
import { join, resolve } from 'path';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node src/cli/update.js <file_path> [repo_root]');
  console.error('  file_path: Path to file to update (relative or absolute)');
  console.error('  repo_root: Repository root (default: current working directory)');
  process.exit(1);
}

const filePath = resolve(args[0]);
const repoRoot = args[1] ? resolve(args[1]) : process.cwd();
const stateDir = join(repoRoot, '.openclaw', 'plugins', 'codebase-brain', 'state');

const indexer = new Indexer(stateDir);

try {
  await indexer.init(repoRoot);
  const result = await indexer.updateFile(filePath);
  if (result.skipped) {
    console.log(`✅ File unchanged: ${filePath}`);
  } else {
    console.log(`✅ Updated file: ${filePath}`);
    console.log(`   Symbols: ${result.symbols || 0}, Refs: ${result.refs || 0}, Imports: ${result.imports || 0}`);
  }
} catch (err) {
  console.error(`❌ Update failed: ${err.message}`);
  process.exit(1);
} finally {
  indexer.close();
}
