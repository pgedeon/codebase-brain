#!/usr/bin/env node

import { Indexer } from '../indexer/Indexer.js';
import { join } from 'path';

const repoRoot = process.argv[2] || process.cwd();
const stateDir = join(repoRoot, '.openclaw/plugins/codebase-brain/state');

const indexer = new Indexer(stateDir);

indexer.indexFull(repoRoot)
  .then(({ indexed, skipped, elapsed }) => {
    console.log(`\n✅ Indexing complete`);
    console.log(`   Files indexed: ${indexed}`);
    console.log(`   Time: ${(elapsed/1000).toFixed(1)}s`);
    console.log(`   Database: ${stateDir}/index.sqlite`);
  })
  .catch(err => {
    console.error('❌ Indexing failed:', err);
    process.exit(1);
  })
  .finally(() => indexer.close());
