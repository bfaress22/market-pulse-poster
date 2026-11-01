import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error('usage: node deploy-json.mjs <function-name>');
  process.exit(1);
}
const args = JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), 'utf8'));
process.stdout.write(JSON.stringify(args));
