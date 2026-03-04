import { readdir, stat } from 'fs/promises';
import { join, relative, extname, basename } from 'path';
import { CONFIG, shouldIgnoreDir, getLanguage } from '../config.js';

/**
 * Load .gitignore patterns from a directory (simple implementation)
 */
async function loadGitignorePatterns(dir) {
  const patterns = new Set();
  const gitignorePath = join(dir, '.gitignore');
  try {
    const { readFile } = await import('fs/promises');
    const content = await readFile(gitignorePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.add(trimmed);
      }
    }
  } catch (err) {
    // No .gitignore, that's fine
  }
  return Array.from(patterns);
}

/**
 * Check if a relative path matches any gitignore pattern (simplified)
 */
function matchesPattern(relPath, pattern) {
  // Normalize to forward slashes
  const normalized = relPath.replace(/\\/g, '/');

  if (pattern.endsWith('/')) {
    // Directory pattern - matches any file/dir under that dir
    const dirPattern = pattern.slice(0, -1);
    return normalized.startsWith(dirPattern) || normalized.split('/').includes(dirPattern);
  }

  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3);
    return normalized.endsWith(suffix) || normalized.split('/').includes(suffix);
  }

  if (pattern.includes('*')) {
    // Convert simple glob to regex
    const regexPattern = '^' + pattern.replace(/\*/g, '.*') + '$';
    try {
      const regex = new RegExp(regexPattern);
      return regex.test(normalized);
    } catch {
      return normalized.includes(pattern.replace(/\*/g, ''));
    }
  }

  // Exact match or contains
  return normalized === pattern || normalized.includes(pattern) || basename(normalized) === pattern;
}

/**
 * Walk a directory tree and collect files to index
 */
export async function walkRepo(rootDir) {
  const gitignorePatterns = await loadGitignorePatterns(rootDir);
  console.log(`📁 Loaded ${gitignorePatterns.length} .gitignore patterns`);

  const files = [];
  const dirsToVisit = [rootDir];

  while (dirsToVisit.length > 0) {
    const dir = dirsToVisit.shift();
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relative(rootDir, fullPath);

        // Check gitignore
        if (gitignorePatterns.some(pattern => matchesPattern(relPath, pattern))) {
          continue;
        }

        if (entry.isDirectory()) {
          if (shouldIgnoreDir(entry.name)) {
            continue;
          }
          dirsToVisit.push(fullPath);
        } else if (entry.isSymbolicLink()) {
          // Skip symlinks for safety
          continue;
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          const lang = getLanguage(fullPath);
          if (lang) {
            try {
              const stats = await stat(fullPath);
              if (stats.size > CONFIG.MAX_FILE_SIZE) {
                console.warn(`Skipping too large file: ${relPath} (${stats.size} bytes)`);
                continue;
              }
              files.push({
                path: relPath,
                fullPath,
                lang,
                size: stats.size,
                mtime: stats.mtimeMs,
              });
            } catch (err) {
              // File may have disappeared
              continue;
            }
          }
        }
      }
    } catch (err) {
      if (err.code !== 'EACCES') {
        console.warn(`Cannot read directory: ${dir}`, err.message);
      }
    }
  }

  return files;
}
