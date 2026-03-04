// Configuration and helper functions

export const CONFIG = {
  // Supported languages and their file extensions
  LANGUAGES: {
    javascript: ['.js', '.jsx', '.mjs'],
    typescript: ['.ts', '.tsx'],
    python: ['.py'],
    // Future: java, go, rust, cpp, c, cs, php, rb, etc.
  },

  // Directories to always ignore (in addition to .gitignore)
  IGNORE_DIRS: new Set([
    'node_modules',
    'dist',
    'build',
    'target',
    '.venv',
    '__pycache__',
    '.git',
    '.next',
    'coverage',
    'logs',
    'tmp',
    'temp',
  ]),

  // File size limit (bytes) - skip huge files
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB

  // Indexing performance targets
  TARGETS: {
    fullIndexUnderSec: 60,
    incrementalUnderSec: 2,
    queryLatencyMs: 250,
  },

  // Token budget for repo_map
  DEFAULT_MAP_TOKENS: 1500,
};

/**
 * Get language from file path
 */
export function getLanguage(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  for (const [lang, exts] of Object.entries(CONFIG.LANGUAGES)) {
    if (exts.includes(ext)) {
      return lang;
    }
  }
  return null;
}

/**
 * Check if a directory should be ignored
 */
export function shouldIgnoreDir(dirName) {
  return CONFIG.IGNORE_DIRS.has(dirName) || dirName.startsWith('.');
}

/**
 * Simple SHA256 hash (async)
 */
export async function hashFile(filePath) {
  const { createHash } = await import('crypto');
  const hash = createHash('sha256');
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Generate stable symbol ID from file + range
 */
export function makeSymbolId(filePath, startLine, startCol, kind) {
  const cleanPath = filePath.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${kind}_${cleanPath}_${startLine}_${startCol}`;
}
