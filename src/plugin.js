import { ToolHandler } from './tools/ToolHandler.js';
import { join } from 'path';

export default {
  id: 'codebase-brain',
  name: 'Codebase Brain',
  description: 'Codebase indexing and navigation tools for OpenClaw agents.',
  configSchema: {
    type: 'object',
    properties: {
      repoRoot: {
        type: 'string',
        description: 'Absolute path to the repository root to index',
      },
      autoIndex: {
        type: 'boolean',
        description: 'Automatically create index on first tool call if missing',
        default: true,
      },
    },
    required: ['repoRoot'],
    additionalProperties: false,
  },
  register(api) {
    const config = api.pluginConfig;
    const repoRoot = config.repoRoot;
    const stateDir = join(repoRoot, '.openclaw', 'plugins', 'codebase-brain', 'state');

    let handler = null;
    let indexed = false;

    const getHandler = async () => {
      if (!handler) {
        handler = new ToolHandler(stateDir);
      }
      return handler;
    };

    const ensureIndexed = async () => {
      if (!indexed) {
        const h = await getHandler();
        try {
          const fileCount = h.db.db.prepare('SELECT COUNT(*) as c FROM files').get().c;
          if (fileCount === 0) {
            await performIndex();
            indexed = true;
          }
        } catch (e) {
          await performIndex();
          indexed = true;
        }
      }
    };

    const performIndex = async () => {
      const { Indexer } = await import('./indexer/Indexer.js');
      const indexer = new Indexer(stateDir);
      await indexer.init(repoRoot);
      await indexer.indexFull(repoRoot);
      indexer.close();
    };

    const createTool = (name, method, schema) => ({
      name: `codebase.${name}`,
      label: name,
      description: `Codebase Brain: ${name}`,
      parameters: schema,
      execute: async (toolCallId, rawParams) => {
        await ensureIndexed();
        const h = await getHandler();
        return h[method](rawParams);
      },
    });

    const tools = [
      createTool(
        'find_function',
        'find_function',
        {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Function/class name to find' },
            limit: { type: 'number', description: 'Max results', default: 10 },
            prefer_files: { type: 'array', items: { type: 'string' }, description: 'Boost these file paths' },
            lang: { type: ['string', 'null'], description: 'Language filter' },
          },
          required: ['name'],
        }
      ),
      createTool(
        'where_is_used',
        'where_is_used',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Symbol name to find references for' },
            limit: { type: 'number', description: 'Max results', default: 200 },
            file_glob: { type: ['string', 'null'], description: 'Glob pattern to filter files' },
          },
          required: ['symbol'],
        }
      ),
      createTool(
        'dependency_tree',
        'dependency_tree',
        {
          type: 'object',
          properties: {
            target: { type: 'string', description: 'Target file path' },
            mode: { type: 'string', enum: ['imports'], description: 'Dependency mode', default: 'imports' },
            depth: { type: 'number', description: 'Max depth', default: 3 },
          },
          required: ['target'],
        }
      ),
      createTool(
        'call_graph',
        'call_graph',
        {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Symbol name' },
            direction: { type: 'string', enum: ['in', 'out', 'both'], description: 'Direction', default: 'both' },
            depth: { type: 'number', description: 'Depth', default: 2 },
          },
          required: ['symbol'],
        }
      ),
      createTool(
        'repo_map',
        'repo_map',
        {
          type: 'object',
          properties: {
            map_tokens: { type: 'number', description: 'Token budget', default: 1500 },
            focus_files: { type: 'array', items: { type: 'string' }, description: 'Files to focus on' },
            strategy: { type: 'string', description: 'Ranking strategy', default: 'pagerank' },
          },
        }
      ),
    ];

    for (const tool of tools) {
      api.registerTool(tool);
    }
  },
};
