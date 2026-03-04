#!/usr/bin/env node

// Simulate OpenClaw plugin API to test codebase-brain loading
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock API
const mockApi = {
  pluginConfig: {
    repoRoot: '/root/codebase-brain/fixtures/ts-mini',
    autoIndex: true,
  },
  registerTool: (tool) => {
    console.log(`✅ Registered tool: ${tool.name} (${tool.description})`);
    console.log(`   Parameters:`, JSON.stringify(tool.parameters, null, 2));
  },
};

// Load plugin
try {
  const plugin = await import('./src/plugin.js');
  console.log('Plugin loaded successfully. ID:', plugin.default.id);
  console.log('Calling register...');
  plugin.default.register(mockApi);
  console.log('\n✅ Plugin registration succeeded. All tools registered.');
} catch (err) {
  console.error('❌ Plugin load/register failed:', err);
  process.exit(1);
}
