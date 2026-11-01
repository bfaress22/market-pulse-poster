import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const names = process.argv.slice(2);
for (const name of names) {
  const src = path.join(__dirname, `${name}.json`);
  const dest = path.join(__dirname, `_mcp-args-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  fs.writeFileSync(dest, JSON.stringify(args), 'utf8');
  const li = args.files.find((f) => f.name.includes('linkedin'));
  console.log(name, 'written', dest, 'bytes', fs.statSync(dest).size, 'linkedin', li?.content?.length ?? 0);
}
