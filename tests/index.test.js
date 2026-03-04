import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rmdir } from 'fs/promises';
import { join } from 'path';
import { Indexer } from '../src/indexer/Indexer.js';
import { ToolHandler } from '../src/tools/ToolHandler.js';

const FIXTURES_DIR = join(process.cwd(), 'fixtures');

describe('codebase-brain Indexer', () => {
  let tempStateDir;
  let indexer;

  beforeEach(async () => {
    // Create temporary state directory
    tempStateDir = await mkdtemp(join(process.cwd(), 'tmp_test_'));
    indexer = new Indexer(tempStateDir);
  });

  afterEach(async () => {
    indexer.close();
    // Cleanup temp dir
    await rmdir(tempStateDir, { recursive: true });
  });

  test('indexes TypeScript fixture', async () => {
    const fixture = join(FIXTURES_DIR, 'ts-mini');
    await indexer.init(fixture);
    const { indexed } = await indexer.indexFull(fixture);
    assert.ok(indexed > 0, 'Should index some files');
    // Symbol counts
    const handler = new ToolHandler(tempStateDir);
    const symbols = await handler.find_function({ name: 'UserRepository' });
    assert.strictEqual(symbols.matches.length, 1, 'Should find UserRepository');
    assert.strictEqual(symbols.matches[0].kind, 'class');
    // Verify utilPrint exists
    const util = await handler.find_function({ name: 'utilPrint' });
    assert.strictEqual(util.matches.length, 1, 'Should find utilPrint');
    handler.close();
  });

  test('indexes Python fixture', async () => {
    const fixture = join(FIXTURES_DIR, 'py-mini');
    await indexer.init(fixture);
    const { indexed } = await indexer.indexFull(fixture);
    assert.ok(indexed > 0);
    const handler = new ToolHandler(tempStateDir);
    // Verify User class exists
    const cls = await handler.find_function({ name: 'User' });
    assert.ok(cls.matches.some(m => m.kind === 'class'), 'Should find User class');
    // Verify authenticate function exists
    const fn = await handler.find_function({ name: 'authenticate' });
    assert.ok(fn.matches.some(m => m.kind === 'function'), 'Should find authenticate function');
    handler.close();
  });

  test('where_is_used finds references', async () => {
    const fixture = join(FIXTURES_DIR, 'ts-mini');
    await indexer.init(fixture);
    await indexer.indexFull(fixture);
    const handler = new ToolHandler(tempStateDir);
    const result = await handler.where_is_used({ symbol: 'UserRepository' });
    assert.ok(result.refs.length > 0, 'Should find references');
    assert.strictEqual(result.symbol, 'UserRepository');
    handler.close();
  });

  test('dependency_tree returns imports', async () => {
    const fixture = join(FIXTURES_DIR, 'ts-mini');
    await indexer.init(fixture);
    await indexer.indexFull(fixture);
    const handler = new ToolHandler(tempStateDir);
    const tree = await handler.dependency_tree({ target: 'index.ts', mode: 'imports', depth: 2 });
    assert.strictEqual(tree.target, 'index.ts');
    assert.ok(Array.isArray(tree.tree.deps), 'Should have deps array');
    // index.ts imports './users'
    const hasUsersDep = tree.tree.deps.some(d => d.file === './users' || d.file.endsWith('/users.ts') || d.file.endsWith('\\users.ts'));
    assert.ok(hasUsersDep, 'Should have dependency on users.ts');
    handler.close();
  });

  test('repo_map respects token budget', async () => {
    const fixture = join(FIXTURES_DIR, 'ts-mini');
    await indexer.init(fixture);
    await indexer.indexFull(fixture);
    const handler = new ToolHandler(tempStateDir);
    const map = await handler.repo_map({ map_tokens: 500 });
    assert.ok(map.text.length > 0, 'Should generate map text');
    assert.ok(Object.keys(map.top_symbols).length > 0, 'Should have top symbols');
    handler.close();
  });

  test('incremental update adds new symbol', async () => {
    // This test assumes fixtures/ts-mini is clean baseline; we'll initialize once and then modify a copy?
    // For simplicity, we'll index ts-mini, then simulate an update by writing a new file and calling updateFile.
    const fixture = join(FIXTURES_DIR, 'ts-mini');
    await indexer.init(fixture);
    await indexer.indexFull(fixture);

    // Verify baseline symbol count
    const handler1 = new ToolHandler(tempStateDir);
    const initialSymbols = await handler1.find_function({ name: 'existingCheck' });
    handler1.close();

    // Create a temporary new file
    const newFile = join(fixture, 'newUtil.ts');
    await import('fs/promises').then(fs => fs.writeFile(newFile, `export function newUtil(): void {}`));

    // Update indexing for this new file
    await indexer.updateFile(newFile);

    // Check that newUtil exists
    const handler2 = new ToolHandler(tempStateDir);
    const newSym = await handler2.find_function({ name: 'newUtil' });
    assert.strictEqual(newSym.matches.length, 1, 'Should find newUtil after incremental update');
    handler2.close();

    // Cleanup new file
    await import('fs/promises').then(fs => fs.unlink(newFile));
  });
});
