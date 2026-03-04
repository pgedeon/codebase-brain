/**
 * Gitignore matcher using the 'ignore' package (lightweight)
 * This will be a simple wrapper; we'll install 'ignore' if needed
 */
export async function createGitignoreMatcher(rootDir) {
  const { create } = await import('ignore');
  const ig = create();

  // Load .gitignore from root
  const gitignorePath = join(rootDir, '.gitignore');
  try {
    const { readFile } = await import('fs/promises');
    const content = await readFile(gitignorePath, 'utf8');
    ig.add(content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')));
  } catch (err) {
    // No .gitignore, that's fine
  }

  return {
    ignores: (path) => ig.test(path) || ig.test(basename(path)),
  };
}

// For now, simple inline implementation without external packages
export function simpleGitignore(rootDir) {
  const gitignorePath = join(rootDir, '.gitignore');
  let patterns = [];
  try {
    const { readFileSync } = require('fs');
    const content = readFileSync(gitignorePath, 'utf8');
    patterns = content.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } catch (err) {
    // No .gitignore
  }

  // Add default ignores
  patterns.push('node_modules/', 'dist/', 'build/', '.venv/', '__pycache__/', '.git/');

  // Convert to minimatch-like pattern (simplified)
  return {
    ignores: (path) => {
      const normalized = path.replace(/\\/g, '/');
      return patterns.some(pattern => {
        // Very simple pattern matching
        if (pattern.endsWith('/')) {
          return normalized.startsWith(pattern.slice(0, -1));
        }
        if (pattern.startsWith('*')) {
          return normalized.endsWith(pattern.slice(1));
        }
        return normalized.includes(pattern) || basename(normalized) === pattern;
      });
    },
  };
}
