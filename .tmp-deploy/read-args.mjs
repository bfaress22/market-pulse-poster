import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
const args = JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), 'utf8'));
const li = args.files.find((f) => f.name.includes('linkedin.ts'));
const placeholder = li?.content?.includes('PLACEHOLDER');
console.log(JSON.stringify({
  name: args.name,
  entrypoint_path: args.entrypoint_path,
  verify_jwt: args.verify_jwt,
  fileCount: args.files.length,
  linkedinLen: li?.content?.length ?? 0,
  placeholder,
}));
