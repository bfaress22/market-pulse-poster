import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const names = [
  'run-workflow',
  'list-grok-models',
  'generate-post',
  'compose-text',
  'generate-image',
  'linkedin-oauth',
  'publish-linkedin',
  'publish-scheduled',
  'run-schedules',
  'run-topic-queue',
];

for (const name of names) {
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), 'utf8'));
  fs.writeFileSync(path.join(__dirname, `_out-${name}.json`), JSON.stringify(payload));
  console.log(name, 'ready', payload.verify_jwt);
}
