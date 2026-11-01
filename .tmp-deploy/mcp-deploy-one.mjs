import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) process.exit(1);
const args = JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), 'utf8'));
// stdout is consumed by agent for CallDynamicTool deploy_edge_function arguments
process.stdout.write(JSON.stringify(args));
