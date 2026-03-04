#!/usr/bin/env node

import { ToolHandler } from './src/tools/ToolHandler.js';

const stateDir = '/root/codebase-brain/fixtures/ts-mini/.openclaw/plugins/codebase-brain/state';
const handler = new ToolHandler(stateDir);

async function runTests() {
  try {
    console.log('Testing codebase.find_function for "UserRepository"...');
    const result1 = await handler.find_function({ name: 'UserRepository' });
    console.log('Result:', JSON.stringify(result1, null, 2));
    console.log('✅ find_function works\n');

    console.log('Testing codebase.where_is_used for "UserRepository"...');
    const result2 = await handler.where_is_used({ symbol: 'UserRepository' });
    console.log('Result:', JSON.stringify(result2, null, 2));
    console.log('✅ where_is_used works\n');

    console.log('Testing codebase.dependency_tree for index.ts...');
    const result3 = await handler.dependency_tree({ target: 'index.ts', mode: 'imports', depth: 2 });
    console.log('Result:', JSON.stringify(result3, null, 2));
    console.log('✅ dependency_tree works\n');

    console.log('Testing codebase.repo_map...');
    const result4 = await handler.repo_map({ map_tokens: 500 });
    console.log('Map text length:', result4.text.length);
    console.log('✅ repo_map works\n');

    console.log('All tool APIs functional. Plugin ready for OpenClaw.');
  } catch (err) {
    console.error('❌ Tool test failed:', err);
    process.exit(1);
  } finally {
    handler.close();
  }
}

runTests();
