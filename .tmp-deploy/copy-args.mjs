import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const n of ['publish-linkedin', 'publish-scheduled', 'run-schedules', 'run-topic-queue']) {
  const src = path.join(__dirname, `${n}.json`);
  const dest = path.join(__dirname, `_args-${n}.json`);
  fs.copyFileSync(src, dest);
  console.log('copied', n, fs.statSync(dest).size);
}
