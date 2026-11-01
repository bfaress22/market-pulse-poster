import fs from "fs";
import path from "path";

const root = "supabase/functions";
const sharedDir = path.join(root, "_shared");
const outDir = ".tmp-deploy";
fs.mkdirSync(outDir, { recursive: true });

const sharedByName = Object.fromEntries(
  fs
    .readdirSync(sharedDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, fs.readFileSync(path.join(sharedDir, f), "utf8")]),
);

const verifyJwt = {
  "publish-scheduled": false,
  "run-schedules": false,
  "run-topic-queue": false,
};

function collectShared(entryContent) {
  const needed = new Set();
  const queue = [];
  for (const m of entryContent.matchAll(/from ["'](\.\.\/_shared\/[^"']+)["']/g)) {
    queue.push(path.basename(m[1]));
  }
  while (queue.length) {
    const base = queue.pop();
    if (needed.has(base) || !sharedByName[base]) continue;
    needed.add(base);
    for (const m of sharedByName[base].matchAll(/from ["'](\.\/[^"']+)["']/g)) {
      queue.push(path.basename(m[1]));
    }
  }
  return [...needed];
}

const funcs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared")
  .map((d) => d.name);

for (const name of funcs) {
  const entry = fs.readFileSync(path.join(root, name, "index.ts"), "utf8");
  const shared = collectShared(entry);
  const files = [
    { name: "index.ts", content: entry },
    ...shared.map((f) => ({ name: `../_shared/${f}`, content: sharedByName[f] })),
  ];
  const payload = {
    name,
    entrypoint_path: "index.ts",
    verify_jwt: Object.prototype.hasOwnProperty.call(verifyJwt, name) ? verifyJwt[name] : true,
    files,
  };
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(payload));
  console.log(
    `${name} => ${files.map((f) => f.name).join(", ")} | jwt=${payload.verify_jwt}`,
  );
}
