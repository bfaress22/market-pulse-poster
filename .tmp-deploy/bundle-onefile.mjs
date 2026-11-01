import fs from "fs";
import path from "path";

const root = "supabase/functions";
const outDir = ".tmp-deploy/bundled";
fs.mkdirSync(outDir, { recursive: true });

function collect(entryContent) {
  const needed = new Set();
  const queue = [];
  for (const m of entryContent.matchAll(/from ["'](\.\.\/_shared\/[^"']+)["']/g)) {
    queue.push(path.basename(m[1]));
  }
  while (queue.length) {
    const base = queue.pop();
    if (needed.has(base)) continue;
    needed.add(base);
    const content = fs.readFileSync(path.join(root, "_shared", base), "utf8");
    for (const m of content.matchAll(/from ["'](\.\/[^"']+)["']/g)) {
      queue.push(path.basename(m[1]));
    }
  }
  return [...needed];
}

function stripImports(content) {
  return content
    .replace(/^import\s+type\s+[^;]+;\s*$/gm, "")
    .replace(/^import\s+[^;]+from\s+["']\.\/[^"']+["'];\s*$/gm, "")
    .replace(/^export\s+type\s+[^;=]+=[^;]+;\s*$/gm, (s) => s.replace(/^export\s+/, ""))
    .replace(/^export\s+(async\s+)?function/gm, "$1function")
    .replace(/^export\s+const/gm, "const")
    .replace(/^export\s+\{[^}]+\};\s*$/gm, "");
}

function bundle(name) {
  const entryPath = path.join(root, name, "index.ts");
  let entry = fs.readFileSync(entryPath, "utf8");
  const sharedNames = collect(entry);
  // topological-ish: logger first, then others
  const order = [
    "logger.ts",
    "schedule-time.ts",
    "cron-auth.ts",
    "ai-text.ts",
    "xai-image.ts",
    "jobs.ts",
    "linkedin.ts",
    "ai-image.ts",
  ].filter((n) => sharedNames.includes(n));
  for (const n of sharedNames) if (!order.includes(n)) order.push(n);

  const parts = [];
  parts.push("// auto-bundled for deploy — do not edit");
  for (const n of order) {
    const raw = fs.readFileSync(path.join(root, "_shared", n), "utf8");
    parts.push(`\n// ---- _shared/${n} ----\n`);
    parts.push(stripImports(raw));
  }
  entry = entry.replace(/^import\s+[^;]+from\s+["']\.\.\/_shared\/[^"']+["'];\s*$/gm, "");
  parts.push("\n// ---- entry ----\n");
  parts.push(entry);

  const content = parts.join("\n").replace(/\r\n/g, "\n");
  fs.writeFileSync(path.join(outDir, `${name}.ts`), content);
  return { name, bytes: content.length };
}

const verifyJwt = {
  "publish-scheduled": false,
  "run-schedules": false,
  "run-topic-queue": false,
};

for (const name of [
  "publish-linkedin",
  "publish-scheduled",
  "run-schedules",
  "run-topic-queue",
]) {
  const { bytes } = bundle(name);
  const payload = {
    name,
    entrypoint_path: "index.ts",
    verify_jwt: Object.prototype.hasOwnProperty.call(verifyJwt, name)
      ? verifyJwt[name]
      : true,
    files: [
      {
        name: "index.ts",
        content: fs.readFileSync(path.join(outDir, `${name}.ts`), "utf8"),
      },
    ],
  };
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(payload));
  console.log(name, bytes, "jwt="+payload.verify_jwt);
}
