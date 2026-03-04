import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function loadSchema() {
  const schemaPath = join(__dirname, 'state', 'schema.sql');
  return readFileSync(schemaPath, 'utf8');
}
