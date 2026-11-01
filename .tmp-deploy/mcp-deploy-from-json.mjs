/**
 * Prints deploy_edge_function arguments JSON to stdout (UTF-8).
 * Agent passes output to CallDynamicTool deploy_edge_function arguments.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error('usage: node mcp-deploy-from-json.mjs <function-name>');
  process.exit(1);
}
const file = path.join(__dirname, `${name}.json`);
const args = JSON.parse(fs.readFileSync(file, 'utf8'));
process.stdout.write(JSON.stringify(args));
