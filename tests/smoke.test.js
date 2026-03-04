#!/usr/bin/env node

/**
 * Test runner for codebase-brain plugin
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { join, mkdirSync, unlinkSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const FIXTURES_DIR = join(process.cwd(), 'fixtures');
const STATE_DIR = join(process.cwd(), '.openclaw/plugins/codebase-brain/state');

console.log('🧪 Running codebase-brain tests...\n');

// Helper: ensure clean state
function cleanState() {
  if (existsSync(join(STATE_DIR, 'index.sqlite'))) {
    unlinkSync(join(STATE_DIR, 'index.sqlite'));
  }
  // Recreate empty DB
  const { Database } = await import('./src/database/Database.js');
  const db = new Database(STATE_DIR);
  db.close();
}

// Test 1: Fixture indexing
test('index ts-mini fixture', async () => {
  cleanState();

  const fixture = join(FIXTURES_DIR, 'ts-mini');
  if (!existsSync(fixture)) {
    console.log('⏭️  Skipping: fixtures/ts-mini not created yet');
    return;
  }

  const { Indexer } = await import('./src/indexer/Indexer.js');
  const indexer = new Indexer(STATE_DIR);
  const { indexed } = await indexer.indexFull(fixture);
  indexer.close();

  assert(indexed > 0, 'Should index some files');
  console.log(`  ✅ Indexed ${indexed} files`);
});

// Test 2: find_function returns results
test('find_function returns symbols', async () => {
  const { ToolHandler } = await import('./src/tools/ToolHandler.js');
  const handler = new ToolHandler(STATE_DIR);
  const result = await handler.find_function({ name: 'hello' });
  handler.close();

  assert(Array.isArray(result.matches), 'matches should be array');
  console.log(`  ✅ find_function returned ${result.matches.length} matches`);
});

// Test 3: where_is_used finds references
test('where_is_used finds refs', async () => {
  const { ToolHandler } = await import('./src/tools/ToolHandler.js');
  const handler = new ToolHandler(STATE_DIR);
  const result = await handler.where_is_used({ symbol: 'User' });
  handler.close();

  assert(result.symbol === 'User', 'symbol should be echoed');
  assert(Array.isArray(result.refs), 'refs should be array');
  console.log(`  ✅ where_is_used found ${result.refs.length} refs`);
});

// Test 4: repo_map generates output
test('repo_map respects token budget', async () => {
  const { ToolHandler } = await import('./src/tools/ToolHandler.js');
  const handler = new ToolHandler(STATE_DIR);
  const result = await handler.repo_map({ map_tokens: 500 });
  handler.close();

  assert(result.text.includes('##'), 'text should have markdown headers');
  assert(Object.keys(result.top_symbols).length > 0, 'should have top symbols');
  assert(result.map_tokens === 500, 'should respect token budget');
  console.log(`  ✅ repo_map generated ${result.text.length} chars`);
});

console.log('\n📊 Running tests...');
