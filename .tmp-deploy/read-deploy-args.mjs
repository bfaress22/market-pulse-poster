import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) process.exit(1);
const file = path.join(__dirname, `${name}.json`);
const args = JSON.parse(fs.readFileSync(file, 'utf8'));
process.stdout.write(JSON.stringify(args));
