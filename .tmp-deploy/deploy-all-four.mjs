/**
 * Reads each *.json deploy payload and prints one JSON line per function:
 * { "tool": "deploy_edge_function", "arguments": { ...full payload... } }
 * Used by agent to feed CallDynamicTool without shell truncation.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const names = process.argv.slice(2);
if (!names.length) {
  console.error('usage: node deploy-all-four.mjs publish-linkedin ...');
  process.exit(1);
}
for (const name of names) {
  const args = JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), 'utf8'));
  const li = args.files.find((f) => f.name.includes('linkedin.ts'));
  process.stderr.write(`${name} files=${args.files.length} linkedin=${li?.content?.length ?? 0} jwt=${args.verify_jwt}\n`);
  process.stdout.write(JSON.stringify({ tool: 'deploy_edge_function', arguments: args }) + '\n');
}
