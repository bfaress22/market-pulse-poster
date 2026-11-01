import fs from 'fs';
import path from 'path';

const name = process.argv[2];
if (!name) {
  console.error('usage: node load-payload.mjs <function-name>');
  process.exit(1);
}
const file = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), `${name}.json`);
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
process.stdout.write(JSON.stringify(payload));
