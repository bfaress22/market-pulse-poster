import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error('usage: node run-mcp-deploy.mjs <function-name>');
  process.exit(1);
}
const argsPath = path.join(__dirname, `${name}.json`);
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
const li = args.files.find((f) => f.name.includes('linkedin.ts'));
console.error(
  `[deploy] ${name} files=${args.files.length} linkedinLen=${li?.content?.length ?? 0} jwt=${args.verify_jwt}`,
);
// Emit args for agent/MCP consumer on stdout
process.stdout.write(JSON.stringify(args));
