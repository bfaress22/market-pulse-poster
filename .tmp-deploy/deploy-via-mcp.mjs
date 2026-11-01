import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error('usage: node deploy-via-mcp.mjs <function-name>');
  process.exit(1);
}
const args = JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), 'utf8'));
// Output path for agent to pass to CallDynamicTool deploy_edge_function
process.stdout.write(JSON.stringify(args));
