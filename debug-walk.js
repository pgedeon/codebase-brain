import { walkRepo } from './src/indexer/walker.js';
import { resolve } from 'path';

const root = resolve(process.argv[2] || '.');
walkRepo(root).then(files => {
  console.log(`Found ${files.length} files to index in ${root}`);
  console.log('First 10:');
  files.slice(0, 10).forEach(f => console.log(` - ${f.path} (${f.lang})`));
}).catch(err => {
  console.error('Walker error:', err);
});
