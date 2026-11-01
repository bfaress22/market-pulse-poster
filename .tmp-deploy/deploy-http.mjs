import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error('usage: node deploy-http.mjs <function-name>');
  process.exit(1);
}
const args = JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), 'utf8'));
const url = new URL(
  'https://mcp.supabase.com/mcp?project_ref=rmoubcwfgupjocqjfqpg&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching%2Cfeedback%2Cstorage',
);
const transport = new StreamableHTTPClientTransport(url);
const client = new Client({ name: 'local-deploy', version: '1.0.0' });
await client.connect(transport);
const result = await client.callTool({ name: 'deploy_edge_function', arguments: args });
console.log(JSON.stringify(result, null, 2));
await client.close();
