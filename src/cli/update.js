#!/usr/bin/env node

import { Indexer } from '../indexer/Indexer.js';
import { join } from 'path';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node src/cli/update.js <file_path>');
  process.exit(1);
}

// Assume we are running from the repo root
const repoRoot = process.cwd();
const stateDir = join(repoRoot, '.openclaw/plugins/codebase-brain/state');

const indexer = new Indexer(stateDir);

try {
  await indexer.init(repoRoot);
  const result = await indexer.updateFile(join(repoRoot, filePath));
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
